## AJV and the OWF JSON Schema

[AJV](https://ajv.js.org/) (Another JSON Validator) is the JSON Schema
validation library used internally by the
[OWF TypeScript SDK](https://github.com/open-workflow-specification/sdk-typescript).
AJV accepts a JSON Schema object directly and compiles it into a highly
efficient validator function. Scalar constraints such as `minLength`,
`maxLength`, `pattern`, `minimum`, `maximum`, and `enum` are all supported out
of the box under the JSON Schema 2020-12 dialect that the OWF schema uses.

The schema is defined and owned by the SDK. All validation — field-level,
task-level, and workflow-level — must be implemented on the SDK side, using
that schema as the single source of truth. The editor must not own a copy of
the schema or reimplement validation logic independently: doing so would create
two copies that must be kept in sync, and any divergence would silently allow
edits that the SDK rejects.

### Target state — validation API in the SDK

The correct long-term solution is to **extend the SDK's public API with
`validateField` and `validateTask` functions**, so that all validation logic —
field-level, task-level, and workflow-level — lives in a single place:

```
sdk-typescript/
  src/
    validation/
      validateField(taskType, fieldName, value)  → ValidationError[]
      validateTask(taskType, task)               → ValidationError[]
      validateWorkflow(workflow)                 → ValidationError[]  ← already exists
```

This eliminates schema duplication entirely. The editor becomes a thin consumer
of the SDK's validation API rather than an independent validator:

- **No schema copy to maintain.** The schema is owned exclusively by the SDK.
- **No sync required.** Schema updates ship with the SDK version; the editor
  picks them up automatically on dependency upgrade.
- **Consistent error semantics.** The same error shapes, messages, and path
  conventions are used everywhere in the ecosystem.
- **Single source of truth.** Any future tooling (CLI, language server, other
  editors) can reuse the same SDK validation API without reimplementing it.

Until the SDK exposes those functions, the local copy and the current
`validator.ts` implementation serve as the reference design for what the SDK
API should look like.

---

## Validation Approaches Explored

### 1. Per-field validation (`validateField`)

A single scalar field can be validated in isolation by extracting the
property sub-schema for that field from the task's `$defs` entry and
compiling a standalone AJV validator for it.

**Implementation:** [`validator.ts` → `validateField`](./validator.ts)

```ts
validateField(taskType: string, fieldName: string, value: unknown): ErrorItem[]
```

**Pros:**

- Immediate, inline feedback as the user edits — errors appear on `blur`
  without any round-trip.
- Fast: the compiled validator is cached and only a single property schema is
  evaluated.
- Low noise: only the field being edited is highlighted, leaving the rest of
  the form clean.

**Cons / Scope limitations:**

- **Isolated context.** The validation operates on the field value in
  isolation. It does not see the other fields in the same task. Cross-field
  constraints (e.g. "field A is required only when field B has value X")
  cannot be detected at this level.
- **No task context.** The field is validated against its own property schema,
  not against the task as a whole. Required-field violations on sibling fields
  are invisible.
- **No workflow context.** Whether the task is valid within the surrounding
  workflow (e.g. a referenced error name that does not exist) is entirely out
  of scope.

---

### 2. Task-level validation (`validateTask`)

A complete task object — all its current field values — can be validated
against the task sub-schema in `$defs` (e.g. `setTask`, `waitTask`).

**Implementation:** [`validator.ts` → `validateTask`](./validator.ts)

```ts
validateTask(taskType: string, task: object): ErrorItem[]
```

AJV compiles the task sub-schema with the full `$defs` bundle attached so that
internal `$ref` chains (e.g. `callTask → endpoint → uriTemplate`) resolve
correctly. The compiled validator is cached per task type.

**What this catches:**

- Missing required fields.
- Wrong types on individual fields.
- Cross-field constraints expressible in JSON Schema (e.g. `if`/`then`/`else`,
  `dependentRequired`).
- Pattern, length, and range violations across all fields simultaneously.

**Scope limitations:**

- **No workflow context.** The task sub-schema describes a single task in
  isolation. It does not encode relationships between tasks: the order of
  execution, the names of other tasks referenced by `then`, or whether an
  error name used in a `raise` task actually exists in the workflow's error
  catalogue.
- A task that passes `validateTask` may still produce errors when the full
  workflow is validated (see below).

---

### 3. Full workflow validation (`validate`)

The only way to achieve a fully consistent validation is to validate the
complete workflow object against the root schema.

**Implementation:** [`validator.ts` → `validate`](./validator.ts)

```ts
validate(workflow: object): ErrorItem[]
```

This feeds the entire workflow to AJV compiled on the root `workflow.json`
schema. All inter-task relationships, required top-level properties (`document`,
`do`), and cross-cutting constraints are evaluated together. Errors are
normalised to `ErrorItem[]` with path information that can be mapped back to
specific nodes in the diagram.

This level of validation is already performed every time the workflow is
(re-)loaded through the SDK in
[`workflowSdk.ts` → `validateWorkflow`](../workflowSdk.ts).

---

## Scope Summary

| Scope        | What is validated                            | What is missed                             |
| ------------ | -------------------------------------------- | ------------------------------------------ |
| **Field**    | Single property value against its own schema | Sibling fields, task structure, workflow   |
| **Task**     | All fields in context of the task sub-schema | Cross-task relations, workflow-level rules |
| **Workflow** | Full document — all tasks, all relations     | Nothing (authoritative)                    |

---

## Recommended Strategy: Layered Validation

The three scopes are complementary and should be combined in a layered
strategy rather than choosing one over the others:

### While editing (per-field, on blur)

As the user types in the `TaskEditForm`, each field is validated on `blur`
using `validateField`. This provides immediate, low-noise feedback — an
inline error tooltip appears next to the offending input without disrupting
the rest of the form.

This is already implemented in
[`TaskEditForm.tsx` → `handleBlur`](../../side-panel/TaskEditForm.tsx).

### On Apply (task-level, blocking)

When the user clicks **Apply**, `validateTask` is executed against the
complete in-progress task object (all current field values merged back into
the task via `deepSet`). If any errors are returned, they are written into the
`errorMap` and highlighted on the form — the apply is **blocked** and the
model is not mutated.

Only when `validateTask` returns no errors does the apply proceed: `updateTask`
commits the change to the in-memory model.

This is already implemented in
[`TaskEditForm.tsx` → `handleApply`](../../side-panel/TaskEditForm.tsx).

### After Apply (workflow-level, automatic)

Once `updateTask` writes the change into the model, the diagram is reloaded
from the updated model. The reload passes the full workflow through the SDK,
which internally calls `validateWorkflow` (backed by `validate`). Any
workflow-level errors — including errors in tasks other than the one just
edited — are surfaced in the **Errors** panel in the side-panel via
[`ErrorsSection.tsx`](../../side-panel/ErrorsSection.tsx).

This means full consistency is guaranteed after every committed change with no
additional user action required.

---

## Architecture of the Validation Core (PoC only)

The implementation lives entirely in `src/core/validation/` and has no
dependency on React, the SDK, the store, or the DOM. It is importable in
Node.js (Vitest) test environments.

| Module                                           | Responsibility                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [`schemaRegistry.ts`](./schemaRegistry.ts)       | Loads `workflow.json` once; exposes `getSubSchema`, `getTaskBaseSchema`, `rootWorkflowSchema` |
| [`validator.ts`](./validator.ts)                 | Public API: `getFieldDescriptors`, `validateField`, `validateTask`, `validate`                |
| [`errorNormalizer.ts`](./errorNormalizer.ts)     | Converts raw AJV `ErrorObject[]` to `ErrorItem[]` with human-readable messages                |
| [`types.ts`](./types.ts)                         | Shared type definitions: `FieldDescriptor`, `FieldConstraints`                                |
| [`schema/workflow.json`](./schema/workflow.json) | Verbatim copy of the upstream OWF JSON Schema                                                 |

Tests are in `tests/core/validation/`.

---

## Edit Mode Validation — User perspective

This section describes how validation should behave from the user's perspective
when the side panel is in edit mode. The scenarios below reflect what was
implemented in this spike and serve as the basis for the production design.

### Scenario 1 — Typing in a field (inline feedback)

The user selects a task node and the side panel opens in edit mode, showing the
task's editable fields. As the user edits a field and moves focus away (on
blur), the field is validated immediately against its own schema constraint.

- If the value violates a constraint (e.g. a required string is left empty, a
  value does not match the expected pattern), a tooltip appears next to the
  field listing the specific error messages.
- The field input border is highlighted in red to draw attention.
- No other fields are affected — the rest of the form remains clean.
- The error clears as soon as the user corrects the value and moves focus away
  again.

This provides early, focused feedback without interrupting the editing flow.

### Scenario 2 — Clicking Apply with field errors present

The user clicks the **Apply** button while one or more fields show inline
errors from Scenario 1.

- The full task — all current field values — is validated together against the
  task schema.
- All fields with violations are highlighted simultaneously, not just the one
  that was last edited.
- The apply is **blocked**: no change is written to the model.
- The user must correct all highlighted errors before the apply can proceed.

This prevents partial or inconsistent task state from ever reaching the model.

### Scenario 3 — Clicking Apply with no field errors

All fields pass inline validation and the user clicks **Apply**.

- The full task validation runs as a final gate (same as Scenario 2).
- If the task is valid, the change is committed to the in-memory model.
- All error highlights on the form are cleared.
- The side panel remains open, showing the updated values.

### Scenario 4 — Workflow-level errors surfaced after Apply

After a successful apply (Scenario 3), the diagram reloads from the updated
model. The full workflow is validated at this point.

- Any workflow-level errors — including errors in tasks other than the one just
  edited — are listed in the **Errors** panel at the bottom of the side panel.
- Each error is associated with the node that owns it, so the user can navigate
  directly to the offending task.
- This validation runs automatically; the user does not need to trigger it.

This is the only level at which cross-task and workflow-wide constraints
(e.g. references between tasks, required top-level properties) are fully
evaluated.

### Scenario 5 — Clicking Cancel

The user makes changes to one or more fields and then clicks **Cancel**.

- All field values are restored to the state they were in when the edit session
  started (the snapshot taken when the task was first opened for editing).
- All error highlights are cleared.
- No change is written to the model.
