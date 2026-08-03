# Architecture — Task Field Validation (Feasibility Spike / PoC)

> **Related spec:** [feature-spec.md](./feature-spec.md)
> **Status:** Complete
> **Spike / PoC scope** — This describes the implemented PoC shape. All decisions and assumptions are resolved.

---

## 1. Purpose

This document defines the component boundaries, data flows, and key decisions that govern the PoC for task field validation in the side-panel editor. Its goal is to give the implementer a clear structural target while keeping the design minimal and traceable to the feature specification.

---

## 2. System context

The editor is an embeddable React component. At the PoC stage it is **read-only** — the workflow model is parsed from YAML/JSON on load and is never mutated. This PoC introduces the **first write path**: the user edits a task's scalar fields in the side-panel and commits the change to the in-memory model via an Apply button.

The diagram, YAML source view, and Mermaid export remain read-only and are not affected by in-progress edits (see spec §3 out-of-scope).

```
┌─────────────────────────────────────────────────────┐
│  DiagramEditorContextProvider                       │
│                                                     │
│  model: Specification.Workflow | null   (state)     │
│  isReadOnly: boolean                    (state)     │
│                                                     │
│  ┌───────────────────┐   ┌────────────────────────┐ │
│  │   Diagram (RF)    │   │      SidePanel         │ │
│  │   read-only       │   │  NodeDetailsView  ←──┐ │ │
│  │   no changes      │   │  TaskEditForm  (new) │ │ │
│  └───────────────────┘   └──────────────────────┼─┘ │
│                                                  │   │
│                           src/core/validation/   │   │
│                           ├─ schema/             │   │
│                           ├─ taskValidator.ts ───┘   │
│                           └─ errorNormalizer.ts       │
└─────────────────────────────────────────────────────┘
```

---

## 3. Major components

| Component                      | Location                                     | New / Existing |
| ------------------------------ | -------------------------------------------- | -------------- |
| Validation core                | `src/core/validation/`                       | **New**        |
| Schema files                   | `src/core/validation/schema/`                | **New**        |
| `TaskEditForm`                 | `src/side-panel/TaskEditForm.tsx`            | **New**        |
| `NodeDetailsView`              | `src/side-panel/NodeDetailsView.tsx`         | Modified       |
| `SidePanel`                    | `src/side-panel/SidePanel.tsx`               | Modified       |
| `DiagramEditorContext`         | `src/store/DiagramEditorContext.tsx`         | Modified       |
| `DiagramEditorContextProvider` | `src/store/DiagramEditorContextProvider.tsx` | Modified       |
| `ErrorSection` / `ErrorItem`   | `src/side-panel/ErrorsSection.tsx`           | **Unchanged**  |
| `SidebarFooter` (shadcn/ui)    | `src/components/ui/sidebar.tsx`              | **Unchanged**  |

---

## 4. Component responsibilities and boundaries

### 4.1 Validation core — `src/core/validation/`

The validation core is a **pure TypeScript module with no React dependency**. It has no import of `@openworkflowspec/sdk`, `@xyflow/react`, the diagram store, or any rendering module. It must be importable in a Node.js (no-DOM) environment (spec NFR-05).

Its responsibilities are:

- Load / reference the Open Workflow Specification JSON Schema files from `src/core/validation/schema/`.
- Expose `validateTask(task)`: validate a complete task object against the schema and return `ErrorItem[]`.
- Expose `validateField(fieldName, value)`: validate a single scalar field value in isolation and return `ErrorItem[]`.
- Expose `getFieldDescriptors(taskType)`: inspect the sub-schema for the given task type and return an ordered list of `FieldDescriptor` objects — one per editable scalar field — that describe field name, JSON Schema type, label, and whether the field is required. This is the sole source of truth for which fields `TaskEditForm` renders and what control type it uses. (spec FR-12, NFR-08, AD-07).
- Normalise validator library error output to the existing `ErrorItem` shape (`field: string`, `message: string`) — no new error types are introduced (spec NFR-03).

The validation core **does not** interact with React state, the workflow model, or the diagram. It is a stateless function library.

**Sub-structure (as implemented)**

```
src/core/validation/
├── schema/              # OWF JSON Schema — verbatim copy; long-term target: SDK owns this
├── schemaRegistry.ts    # loads schema; resolves sub-schema and $defs by task type
├── validator.ts         # public API: getFieldDescriptors, validateField, validateTask, validate
├── errorNormalizer.ts   # maps AJV ErrorObject[] → ErrorItem[]
└── types.ts             # FieldDescriptor and FieldConstraints types
```

> **Long-term target:** `validateField`, `validateTask`, and `getFieldDescriptors` should be moved into the OWF TypeScript SDK so the schema is owned exclusively there. The editor becomes a thin consumer. See [VALIDATION_SPIKE.md](./VALIDATION_SPIKE.md).

**`FieldDescriptor` shape (contract, not code):**

| Property      | Type                                | Source in JSON Schema                                                                        | Notes                                                                |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `name`        | `string`                            | property key                                                                                 | Used as the field's key when building the task object                |
| `label`       | `string`                            | `title` annotation if present; otherwise the property key transformed to human-readable text | Displayed as the form control label (see OQ-04)                      |
| `type`        | `"string" \| "number" \| "boolean"` | `type` keyword in the property schema                                                        | Determines the control rendered by `TaskEditForm` (see AC-11)        |
| `required`    | `boolean`                           | presence in the parent schema's `required` array                                             | May be used for visual indication (see OQ-05)                        |
| `constraints` | object                              | `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `enum` as present                 | Passed through to `validateField`; not interpreted by `TaskEditForm` |

> **Decision (OQ-01 resolved):** AJV v8 (JSON Schema 2020-12) is used. It directly consumes the OWF `$defs` sub-schemas and supports per-field constraint targeting without a derived schema. Option A is confirmed. The public API is in `validator.ts` (not `taskValidator.ts`).

### 4.2 `TaskEditForm` — `src/side-panel/TaskEditForm.tsx`

A new React component rendered by `NodeDetailsView` when `isReadOnly = false` and a task node is selected. It owns all edit-mode UI and local edit state.

Responsibilities:

- Call `getFieldDescriptors(taskType)` from the validation core on mount and derive the list of editable fields and their control types from the returned `FieldDescriptor[]`. No field names or control types are hard-coded in this component (spec FR-12, NFR-08, AD-07).
- Hold a local copy of the current field values (initialised from `node.data.task` when the panel opens).
- Render each scalar field as a generic editable control whose type is determined by `FieldDescriptor.type`; render the task type field as non-editable text (spec FR-02, FR-10).
- On field blur: call `validateField` from the validation core; update local error state accordingly (spec FR-03, FR-04, FR-05).
- Render the `ErrorSection` banner fed by local error state (spec NFR-03).
- Render Apply and Cancel buttons inside `SidebarFooter` via the sidebar's footer slot, keeping them pinned at the bottom of the viewport regardless of field count (spec FR-02, NFR-07). `TaskEditForm` does not own the footer DOM directly; it signals to `SidePanel` that it needs the footer slot, or `SidePanel` renders the footer conditionally based on `isReadOnly`.
- On Apply: call `validateTask` from the validation core; if errors exist, update error state and do not commit (spec FR-06, FR-07); if no errors, call the `updateTask` action from context and clear state (spec FR-08).
- On Cancel: reset local field values and error state to the snapshot taken at panel-open time (spec FR-09).

`TaskEditForm` **does not** call the validation core when `isReadOnly = true` — that gate is enforced one level up in `NodeDetailsView` by simply not rendering this component (spec NFR-04).

### 4.3 `NodeDetailsView` — `src/side-panel/NodeDetailsView.tsx`

Existing component. Modified to branch on `isReadOnly`:

- `isReadOnly = true` → renders the existing read-only field list and error banner, unchanged. `TaskEditForm` is not mounted and the validation core is never called (spec FR-01, AC-01, AC-09).
- `isReadOnly = false` → renders `TaskEditForm` in place of the static field list.

The YAML source block (`YamlField`) continues to render in both modes, reflecting the committed model state (not the in-progress edit state).

### 4.4 `DiagramEditorContext` and `DiagramEditorContextProvider`

The context currently holds a `model` reference and `isReadOnly` state but exposes no mutation action. The PoC adds a single new action:

- `updateTask(nodeId: string, updatedTask: Specification.Task): void` — replaces the task at `nodeId` in the in-memory model and updates the `model` reference in context state.

This keeps the write path in the context provider (which is the designated place for model state) and leaves `TaskEditForm` free of direct model mutation logic.

No other context changes are required.

---

## 5. Data flow

### 5.1 Side-panel opens on a selected node (read-only mode)

```
user selects node
  → selectedNodeId set in context
  → SidePanel renders NodeDetailsView
  → isReadOnly = true
  → NodeDetailsView renders static field list + ErrorSection (existing behaviour)
  → validation core is NOT called
```

### 5.2 Side-panel opens on a selected node (edit mode)

```
user selects node
  → selectedNodeId set in context
  → SidePanel renders NodeDetailsView
  → isReadOnly = false
  → NodeDetailsView renders TaskEditForm
  → TaskEditForm initialises local field snapshot from node.data.task
  → TaskEditForm renders editable field controls + Apply + Cancel buttons
```

### 5.3 Field blur (edit mode)

```
user edits field value → blurs field
  → TaskEditForm.onBlur(fieldName, value)
  → calls validateField(fieldName, value)  [validation core]
  → normaliseErrors(libraryErrors) → ErrorItem[]
  → if errors:   add/replace ErrorItem for fieldName in local error state
                 apply red-border class to that field control
  → if no errors: remove ErrorItem for fieldName from local error state
                  remove red-border class from that field control
  → ErrorSection re-renders with updated items
```

### 5.4 Apply (edit mode)

```
user clicks Apply
  → TaskEditForm.onApply()
  → calls validateTask(localFieldValues)  [validation core]
  → normaliseErrors(libraryErrors) → ErrorItem[]
  → if errors:   replace full error state with returned ErrorItem[]
                 apply red-border class to each offending field
                 do NOT call updateTask
  → if no errors: calls context.updateTask(nodeId, localFieldValues)
                  clears local error state and red-border classes
```

### 5.5 Cancel (edit mode)

```
user clicks Cancel
  → TaskEditForm.onCancel()
  → reset local field values to the snapshot taken at panel-open time
  → clear all error state and red-border classes
```

---

## 6. Cross-cutting requirements

| Requirement                                             | How it is satisfied                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 — Field validation ≤ 200 ms                      | `validateField` is called synchronously on blur; no async path. JSON Schema validation at single-field granularity is expected to be sub-millisecond in practice.                                                                               |
| NFR-02 — Task validation ≤ 500 ms                       | `validateTask` is called synchronously on Apply click; same rationale as above.                                                                                                                                                                 |
| NFR-03 — Use existing `ErrorItem` / `ErrorSection`      | `errorNormalizer.ts` maps all library errors to `ErrorItem`. `TaskEditForm` feeds `ErrorSection` directly. No new error UI components are introduced.                                                                                           |
| NFR-04 — Zero validation calls when `isReadOnly = true` | `TaskEditForm` is not rendered when `isReadOnly = true`; the validation core is therefore never imported into the active React tree for read-only users.                                                                                        |
| NFR-05 — Validation API decoupled                       | `src/core/validation/` has no React, React Flow, SDK, or store imports. It is independently testable in Vitest (Node.js environment).                                                                                                           |
| NFR-06 — Backward compatibility                         | `NodeDetailsView` read-only branch is preserved without change. All existing tests must continue to pass.                                                                                                                                       |
| NFR-08 — Schema version agnosticism                     | `getFieldDescriptors` is the sole source of truth for field list and control types. No editor component encodes field names statically. Updating schema files in `src/core/validation/schema/` is the only change needed when the spec evolves. |

---

## 7. Key architecture decisions

### AD-01 — Validation library selection (maps to OQ-01)

**Decision: AJV v8 (Option A).** AJV directly consumes the OWF JSON Schema 2020-12 sub-schemas. Per-field constraint targeting is achieved by extracting a field's property sub-schema from `$defs` and compiling a standalone AJV validator with the full `$defs` bundle attached for `$ref` resolution. Option B (derived Zod schema) was not needed.

The library is used only in `validator.ts`; `errorNormalizer.ts` absorbs AJV's `ErrorObject` shape. Switching libraries in future remains a two-file change.

### AD-02 — Edit state lives in `TaskEditForm`, not in context

In-progress edits are **local component state** inside `TaskEditForm`. They are not propagated to `DiagramEditorContext` until Apply is confirmed. This avoids polluting the shared model with uncommitted values and keeps the Apply / Cancel cycle self-contained (spec §3: "Persistence or undo/redo of edits beyond the Apply / Cancel cycle" is out of scope).

### AD-03 — `updateTask` is the only new context action

The context is extended with a single `updateTask` action. No further state is added to the context for this PoC (no in-progress edit state, no per-field error state). This minimises the blast radius on context consumers.

### AD-04 — Schema files live in `src/core/validation/schema/` (interim)

The JSON Schema file is copied into the repository under `src/core/validation/schema/workflow.json` as a verbatim copy of the upstream OWF schema. This satisfies NFR-05 (no `@openworkflowspec/sdk` import at runtime) and makes the validation core self-contained and testable offline.

**Long-term target:** The schema copy is an interim measure. The production design moves `validateField`, `validateTask`, and `getFieldDescriptors` into the SDK so the schema is exclusively SDK-owned — no local copy, no sync required. The editor references schema updates automatically on SDK version upgrade. See [VALIDATION_SPIKE.md](./VALIDATION_SPIKE.md) for the proposed SDK API.

### AD-05 — Task type field is always read-only

The task type key is identified and excluded from editable controls at render time inside `TaskEditForm`. This mirrors the existing `TASK_BASE_KEYS` pattern in [`src/core/taskDetails.ts`](../../src/core/taskDetails.ts). It is not enforced by the validation core.

### AD-07 — Form is schema-driven via `getFieldDescriptors` (resolves NFR-08)

**Decision:** The validation core exposes a third public function, `getFieldDescriptors(taskType)`, that reads the JSON Schema sub-schema for the given task type and returns a `FieldDescriptor[]` — one entry per editable scalar field. `TaskEditForm` calls this on mount and renders one generic control per descriptor. No field name, control type, or field order is hard-coded anywhere in the editor components.

**Rationale:** This is the only design that satisfies NFR-08 (schema version agnosticism). If field names were declared statically in `TaskEditForm`, every schema change would require an editor code change, test update, and release. By moving field enumeration into the validation core — which already reads the schema — `TaskEditForm` becomes a generic renderer and the schema files become the authoritative, single-change-point for evolution. The `FieldDescriptor` type is defined in the validation core alongside `ErrorItem` and is the only new type introduced.

_Traceable to: spec FR-12, NFR-08, AC-10, AC-11, OQ-04, OQ-05._

### AD-06 — Apply / Cancel buttons are rendered in `SidebarFooter` (resolves AR-03 / OQ-02)

**Decision:** Apply and Cancel buttons are placed inside the sidebar's `SidebarFooter` slot, which is already used by `MermaidActions` when no node is selected. `SidePanel` renders the appropriate footer content based on the active view: `MermaidActions` when no node is selected and `isReadOnly = false`, or the Apply / Cancel button pair when a node is selected and `isReadOnly = false`. No footer is rendered in read-only mode.

**Rationale:** `SidebarFooter` is a sticky-pinned element provided by the existing shadcn/ui sidebar primitive already in the project. Using it requires no new UI component, no new CSS, and no structural change to the side-panel layout. This resolves OQ-02 without introducing new dependencies or complexity (spec §3 out-of-scope: "Introduction of any new shadcn/ui components beyond the existing `SidebarFooter` primitive already present in the project").

_Traceable to: spec FR-02, NFR-07, AC-02, OQ-02 (resolved)._

---

## 8. Assumptions and decisions — resolved

| #     | Statement                                                                                                                   | Resolution                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AR-01 | **A-02:** The JSON Schema exposes per-task-type sub-schemas that allow field-level targeting without full workflow context. | ✅ Confirmed. `$defs` entries (e.g. `setTask`, `callTask`) are self-contained. `validateField` and `getFieldDescriptors` are implemented in `validator.ts`.              |
| AR-02 | **AD-01:** Library selection (Option A vs. B).                                                                              | ✅ Resolved. AJV v8 (Option A) selected. Documented in [VALIDATION_SPIKE.md](./VALIDATION_SPIKE.md).                                                                     |
| AR-03 | **AD-06:** Apply and Cancel button visibility.                                                                              | ✅ Resolved. `SidePanel` renders buttons in `SidebarFooter` via an imperative ref (`TaskEditFormHandle`) to `TaskEditForm`.                                              |
| AR-04 | **`updateTask` contract:** Index-lookup pattern for replacing a task in `model.do`.                                         | ✅ Resolved. Implemented in `DiagramEditorContextProvider.tsx`: iterates `model.do`, matches by task name (last path segment of `nodeId`), and replaces with `setModel`. |
| AR-05 | **`FieldDescriptor.label` quality (OQ-04):** Schema `title` annotation coverage.                                            | ✅ Resolved. Coverage is sparse; `camelToLabel` transform applied as fallback in `validator.ts`.                                                                         |
