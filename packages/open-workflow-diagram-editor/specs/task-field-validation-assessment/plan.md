# Implementation Plan — Task Field Validation (Feasibility Spike / PoC)

> **Related spec:** [feature-spec.md](./feature-spec.md)
> **Architecture:** [architecture.md](./architecture.md)
> **Design:** [design.md](./design.md)
> **Status:** Complete

---

## Summary

This PoC introduces the first write path into the diagram editor. The goal was to prove that the Open Workflow Specification JSON Schema can drive field-level and task-level validation inside the side-panel, and to identify the most suitable validation library.

**Outcome:** Delivered. The selected library is AJV v8 (Option A — direct JSON Schema consumption). The edit, validate, apply, and cancel cycle is implemented and tested for scalar fields. See [VALIDATION_SPIKE.md](./VALIDATION_SPIKE.md) for the full outcome.

---

## Technical Context

The editor is an embeddable React component. At the start of this PoC it is entirely read-only — the workflow model is parsed from YAML/JSON on load and never mutated. This work introduces the first mutation: committing an edited task object back into the in-memory model via an `updateTask` context action.

The Open Workflow Specification JSON Schema is published at `sdk-typescript/src/lib/generated/schema`. The spike must determine whether that schema exposes per-task-type sub-schemas suitable for field-level targeting without requiring the full workflow context (assumption A-02 in the spec). This is the single most consequential unknown; everything else in the plan is conditioned on its outcome.

A second constraint shapes this PoC beyond a conventional validation spike: the schema will evolve. New task types will appear, and existing task fields will gain, lose, or change constraints. The editor must not require a code release every time this happens. The chosen architecture therefore makes the schema files the single change-point: updating them is sufficient for new task types and field changes to appear in the edit form and be validated correctly. This is enforced by keeping `TaskEditForm` as a pure generic renderer, with no knowledge of field names — it only knows how to render a `FieldDescriptor`.

The existing side-panel already renders task fields as static text and surfaces SDK-originated errors through `ErrorSection`. Those read-only behaviours are not changed by this work.

---

## Components and Boundaries

### New components

| Component         | Location                                   | Responsibility                                                                                                                                                                                             |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation core   | `src/core/validation/`                     | Pure TypeScript module. Exposes `getFieldDescriptors`, `validateTask`, `validateField`, and `validate` as named exports. No React, SDK, React Flow, or store imports. Importable in Node.js without a DOM. |
| Schema file       | `src/core/validation/schema/workflow.json` | Verbatim copy of the upstream OWF JSON Schema. **Interim:** long-term target is to move validation into the SDK so no local copy is needed.                                                                |
| `schemaRegistry`  | `src/core/validation/schemaRegistry.ts`    | Loads `workflow.json`; resolves the sub-schema and `$defs` bundle for a given task type.                                                                                                                   |
| `errorNormalizer` | `src/core/validation/errorNormalizer.ts`   | Maps AJV `ErrorObject[]` to `ErrorItem[]`. The only file aware of AJV's error shape.                                                                                                                       |
| `validator`       | `src/core/validation/validator.ts`         | Public API: `getFieldDescriptors`, `validateField`, `validateTask`, `validate`.                                                                                                                            |
| `TaskEditForm`    | `src/side-panel/TaskEditForm.tsx`          | React component rendered by `NodeDetailsView` when `isReadOnly = false`. Derives field list from `getFieldDescriptors`. Exposes `TaskEditFormHandle` ref for Apply / Cancel triggering from `SidePanel`.   |

### Modified components

| Component                      | Location                                     | Change                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NodeDetailsView`              | `src/side-panel/NodeDetailsView.tsx`         | Branches on `isReadOnly`: mounts `TaskEditForm` (edit mode) or retains the existing static field list (read-only mode). Read-only branch is unchanged.                                                 |
| `SidePanel`                    | `src/side-panel/SidePanel.tsx`               | Renders `SidebarFooter` conditionally: Apply + Cancel when a node is selected and `isReadOnly = false`; `MermaidActions` when no node is selected and `isReadOnly = false`; nothing in read-only mode. |
| `DiagramEditorContext`         | `src/store/DiagramEditorContext.tsx`         | Adds the `updateTask(nodeId, updatedTask)` action type to the context interface.                                                                                                                       |
| `DiagramEditorContextProvider` | `src/store/DiagramEditorContextProvider.tsx` | Implements `updateTask`: replaces the task at `nodeId` in `model.do` and updates the `model` reference in context state.                                                                               |

### Unchanged components

| Component                      | Reason unchanged                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ErrorSection` / `ErrorItem`   | All new validation errors are normalised to the existing `ErrorItem` shape before being passed to `ErrorSection`. No extension of the type or the component. |
| `SidebarFooter` (shadcn/ui)    | Used as-is from `src/components/ui/sidebar.tsx`. No changes to the primitive.                                                                                |
| Diagram (React Flow)           | The diagram remains read-only; in-progress edits never reach it.                                                                                             |
| YAML source view (`YamlField`) | Continues to reflect committed model state only.                                                                                                             |
| Mermaid export                 | Not in scope.                                                                                                                                                |

---

## Interfaces and Integrations

### Validation core public API

The validation core exposes three named export functions. All are synchronous and stateless.

| Function                          | Called by              | Trigger            | Input                                     | Output              |
| --------------------------------- | ---------------------- | ------------------ | ----------------------------------------- | ------------------- |
| `getFieldDescriptors(taskType)`   | `TaskEditForm`         | Component mount    | Task type string                          | `FieldDescriptor[]` |
| `validateTask(task)`              | `TaskEditForm.onApply` | Apply button click | Complete task object (local field values) | `ErrorItem[]`       |
| `validateField(fieldName, value)` | `TaskEditForm.onBlur`  | Field blur event   | Field name + current scalar value         | `ErrorItem[]`       |

An empty array from `validateTask` or `validateField` means the input is valid. An empty `FieldDescriptor[]` means the task type is unrecognised or has no editable scalar fields. None of the functions throw; unrecognised states produce descriptive fallback values.

### `TaskEditForm` ↔ `DiagramEditorContext`

`TaskEditForm` reads `isReadOnly` and `node.data.task` from context (via `NodeDetailsView`). It calls `context.updateTask(nodeId, localFieldValues)` exactly once per successful Apply. In-progress edits never touch the context.

### `TaskEditForm` ↔ `ErrorSection`

`TaskEditForm` feeds `ErrorSection` the current flat array of `ErrorItem` objects from its local error map. `ErrorSection` is a consumer of that array; it has no knowledge of the validation core.

### Schema files ↔ validation core

Schema files in `src/core/validation/schema/` are referenced at module load time as static imports. There is no network fetch, no SDK import, and no runtime resolution. This is what allows the validation core to be tested in Node.js without a DOM (NFR-05).

### Edit state lifecycle

In-progress edits live exclusively in `TaskEditForm` local state. They are never written to context. On Apply (no errors) they are passed to `updateTask` and then become the committed model. On Cancel they are discarded and the local state resets to the snapshot taken when the panel opened.

---

## Key Decisions and Rationale

### AD-01 — Validation library: AJV v8 selected (Option A)

**Decision:** AJV v8 with JSON Schema 2020-12 dialect. Directly consumes the OWF `$defs` sub-schemas. Per-field validation is implemented by compiling a standalone AJV validator for the field's property sub-schema, with the full `$defs` bundle embedded for `$ref` resolution.

**Rationale:** A-02 was confirmed true: the schema exposes self-contained task sub-schemas in `$defs`. Option A is fully viable. No derived schema (Option B) was needed. The library is isolated to `validator.ts` and `errorNormalizer.ts`.

_Traceable to: spec OQ-01 (resolved), architecture AD-01 (resolved), AR-01 (resolved)._

### AD-02 — In-progress edits stay in `TaskEditForm`, not in context

**Decision:** Local edit state is held in `TaskEditForm` component state and is not propagated to `DiagramEditorContext` until Apply is confirmed.

**Rationale:** Putting uncommitted values in the shared context would expose them to consumers that should only see committed model state (the diagram, the YAML view). Keeping state local also makes the Apply / Cancel cycle entirely self-contained, with no rollback logic required in the context.

_Traceable to: spec §3 out-of-scope (persistence/undo beyond Apply/Cancel), architecture AD-02._

### AD-03 — A single new context action (`updateTask`) is sufficient

**Decision:** The context is extended with one action only. No in-progress edit state, no per-field error state, and no additional selectors are added to the context.

**Rationale:** Every other piece of edit-mode state is local to `TaskEditForm`. Adding more to the context would widen the blast radius to all context consumers and complicate future extraction. A single write action is the minimal change needed to land the edit in the model.

_Traceable to: architecture AD-03._

### AD-04 — Schema file copied into the repository (interim)

**Decision:** `workflow.json` is placed under `src/core/validation/schema/` as a static verbatim copy. No runtime SDK import.

**Rationale:** Satisfies NFR-05. The validation core remains self-contained and testable offline. This is an interim measure: the long-term target is to move `validateField`, `validateTask`, and `getFieldDescriptors` into the SDK, eliminating the local copy entirely. Until that happens, [`REGENERATE.md`](../../src/core/validation/REGENERATE.md) documents the sync steps.

_Traceable to: spec NFR-05, FR-11, architecture AD-04. Target state: [VALIDATION_SPIKE.md](./VALIDATION_SPIKE.md)._

### AD-05 — Task type field is excluded at render time, not by the validator

**Decision:** `TaskEditForm` identifies the task type key and excludes it from editable controls at render time. The validation core does not enforce this exclusion.

**Rationale:** The task type is a discriminator used by the validator to select the right sub-schema; allowing it to be edited mid-form would invalidate the schema lookup. The existing `TASK_BASE_KEYS` pattern in `src/core/taskDetails.ts` already handles a similar exclusion concern and provides a natural reference point.

_Traceable to: spec FR-10, architecture AD-05._

### AD-07 — Form is schema-driven via `getFieldDescriptors`

**Decision:** The validation core exposes `getFieldDescriptors(taskType)` as a third public function. It reads the JSON Schema sub-schema for the given task type via `schemaRegistry` and returns a `FieldDescriptor[]` — one entry per editable scalar field, carrying field name, label, type, required flag, and constraints. `TaskEditForm` calls this on mount and renders one generic control per descriptor. No field name, control type, or field order is declared anywhere in the editor components.

**Rationale:** NFR-08 requires that updating schema files is the only change needed when the specification evolves. This is only achievable if the form structure is derived at runtime from the schema rather than declared statically. `getFieldDescriptors` is the bridge: it sits in the validation core (which already reads the schema) and exposes the form structure as data. `TaskEditForm` becomes a pure renderer of that data. A new task type or a new field in an existing type is handled automatically once the corresponding schema file is present.

_Traceable to: spec FR-12, NFR-08, AC-10, AC-11, OQ-04, OQ-05, architecture AD-07, AR-05._

### AD-06 — Apply / Cancel buttons are rendered in `SidebarFooter`

**Decision:** Apply and Cancel buttons are rendered by `SidePanel` inside the `SidebarFooter` slot, which is already used by `MermaidActions` when no node is selected. `SidePanel` selects the footer content based on the active view: Apply + Cancel when a node is selected and `isReadOnly = false`, `MermaidActions` when no node is selected and `isReadOnly = false`, nothing in read-only mode.

**Rationale:** `SidebarFooter` is a sticky-pinned primitive already present in the project. Rendering the action buttons there ensures they are always visible regardless of how many fields `TaskEditForm` displays, with no new UI component, no new CSS, and no structural change. No new shadcn/ui component is needed (spec §3 out-of-scope).

_Traceable to: spec FR-02, NFR-07, AC-02, OQ-02 (resolved), architecture AD-06._

---

## Risks and Assumptions

### Risks and assumptions — resolved

| ID          | Statement                                                                                        | Resolution                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| R-01 / A-02 | A-02 is false — schema does not expose per-field constraints in isolation.                       | ✅ Resolved. A-02 is true. `$defs` sub-schemas are self-contained; `validateField` is implemented.                      |
| R-02        | Option A (AJV) cannot target field granularity.                                                  | ✅ Resolved. Option A confirmed. AJV compiles sub-schemas with `$defs` embedded.                                        |
| R-03        | Error message normalisation edge cases.                                                          | ✅ Resolved. AJV keyword-to-plain-English translation implemented in `errorNormalizer.ts`. Fail-safe fallback in place. |
| R-04        | `updateTask` mutation logic.                                                                     | ✅ Resolved. `DiagramEditorContextProvider` iterates `model.do`, matches by task name, replaces via `setModel`.         |
| A-01        | OWF JSON Schema is machine-readable independently of the SDK.                                    | ✅ Confirmed.                                                                                                           |
| A-03        | Library error output can be normalised to `ErrorItem` without extending the type.                | ✅ Confirmed. AJV errors normalised cleanly.                                                                            |
| A-04        | Only scalar fields in scope; complex fields deferred.                                            | ✅ Confirmed.                                                                                                           |
| A-05        | Schema carries sufficient type information for `getFieldDescriptors` to determine control types. | ✅ Confirmed. `type` keyword and `required` array are present in all task sub-schemas.                                  |
