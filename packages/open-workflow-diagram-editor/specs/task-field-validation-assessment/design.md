# Design — Task Field Validation (Feasibility Spike / PoC)

> **Related spec:** [feature-spec.md](./feature-spec.md)
> **Architecture:** [architecture.md](./architecture.md)
> **Status:** Complete
> **Spike / PoC scope** — This document covers the High-Level Design (HLD) and Low-Level Design (LLD) for the implemented PoC.

---

## High-Level Design

### 1. Overview

The PoC adds a single edit path to the side-panel: the user selects a task node, edits its scalar fields, and either commits the change (Apply) or discards it (Cancel). Validation runs against the Open Workflow Specification JSON Schema at two points — on field blur and on Apply — and surfaces errors through the existing `ErrorSection` component without any new UI primitives.

The form itself — which fields appear and what control renders for each — is also derived from the JSON Schema at runtime via `getFieldDescriptors`. `TaskEditForm` is a generic renderer; it contains no static field declarations. This means only schema files need to change as the specification evolves.

The design is built from four moving parts that the architecture defines:

| Part                                                                 | What it does in this flow                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NodeDetailsView`                                                    | Routes to edit or read-only mode based on `isReadOnly`                                                                            |
| `TaskEditForm`                                                       | Owns local edit state, drives validation, renders controls generically from `FieldDescriptor[]`; exposes `TaskEditFormHandle` ref |
| Validation core (`schemaRegistry` + `validator` + `errorNormalizer`) | Derives field descriptors from the schema; validates; returns `FieldDescriptor[]` and `ErrorItem[]`                               |
| `DiagramEditorContext`                                               | Holds the committed model; exposes `updateTask` as the single write action                                                        |

---

### 2. Main user flow

This covers the end-to-end journey from the user opening the side-panel to a change landing in the model. Read-only mode is shown alongside for contrast.

```
 User action                     Edit mode (isReadOnly = false)     Read-only (isReadOnly = true)
 ─────────────────────────────   ──────────────────────────────     ──────────────────────────────
 Select task node on diagram  →  NodeDetailsView mounts             NodeDetailsView mounts
                                 TaskEditForm renders               Static field list renders
                                 getFieldDescriptors(taskType)       ErrorSection renders (SDK errors)
                                 called → FieldDescriptor[] built   No buttons, no edit controls
                                 Fields initialised from task
                                 Apply + Cancel buttons visible

 Edit a field value           →  Local field value updated
                                 (no validation yet)

 Move focus away (blur)       →  validateField called               (nothing — no edit controls)
                                 Errors → ErrorSection + red border
                                 No errors → error cleared

 Click Apply (with errors)    →  validateTask called
                                 All offending fields highlighted
                                 ErrorSection updated
                                 Model NOT updated

 Click Apply (no errors)      →  validateTask called
                                 context.updateTask called
                                 Model updated
                                 Error state cleared

 Click Cancel                 →  Field values reset to snapshot
                                 Error state cleared
                                 Model NOT updated
```

---

### 3. Main system flow

This shows how data moves through the system for the two validation-triggering events: field blur and Apply.

#### 3.1 Field blur

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  TaskEditForm                                                     │
  │                                                                   │
  │  user edits field → blurs                                        │
  │       │                                                           │
  │       ▼                                                           │
  │  onBlur(fieldName, currentValue)                                  │
  │       │                                                           │
  │       │  ① call                                                   │
  │       ▼                                                           │
  │  ┌──────────────────────────────────────────────┐                │
  │  │  Validation core                              │                │
  │  │                                               │                │
  │  │  taskValidator.validateField(fieldName, value)│                │
  │  │       │                                       │                │
  │  │       ▼                                       │                │
  │  │  JSON Schema lookup for fieldName             │                │
  │  │       │                                       │                │
  │  │       ▼                                       │                │
  │  │  Validation library evaluates value           │                │
  │  │       │                                       │                │
  │  │       ▼                                       │                │
  │  │  errorNormalizer → ErrorItem[]                │                │
  │  └──────────────────┬───────────────────────────┘                │
  │                     │  ② return ErrorItem[]                       │
  │                     ▼                                             │
  │  update local error map for fieldName                             │
  │       │                                                           │
  │       ├── errors present → add red-border class to field control  │
  │       └── no errors      → remove red-border class               │
  │                                                                   │
  │       ▼                                                           │
  │  ErrorSection re-renders with current error map                   │
  └──────────────────────────────────────────────────────────────────┘
```

Spec traceability: FR-03, FR-04, FR-05 · AC-03, AC-04 · NFR-01

---

#### 3.2 Apply

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  TaskEditForm                                                     │
  │                                                                   │
  │  user clicks Apply                                                │
  │       │                                                           │
  │       ▼                                                           │
  │  onApply(localFieldValues)                                        │
  │       │                                                           │
  │       │  ① call                                                   │
  │       ▼                                                           │
  │  ┌──────────────────────────────────────────────┐                │
  │  │  Validation core                              │                │
  │  │                                               │                │
  │  │  taskValidator.validateTask(localFieldValues) │                │
  │  │       │                                       │                │
  │  │       ▼                                       │                │
  │  │  JSON Schema lookup for full task type        │                │
  │  │       │                                       │                │
  │  │       ▼                                       │                │
  │  │  Validation library evaluates full task       │                │
  │  │       │                                       │                │
  │  │       ▼                                       │                │
  │  │  errorNormalizer → ErrorItem[]                │                │
  │  └──────────────────┬───────────────────────────┘                │
  │                     │  ② return ErrorItem[]                       │
  │                     ▼                                             │
  │         ┌───────────┴──────────────┐                             │
  │         │ errors?                  │                             │
  │       yes ▼                      no ▼                            │
  │    replace error map         ③ call context.updateTask           │
  │    red-border all              (nodeId, localFieldValues)         │
  │    offending fields                │                             │
  │    ErrorSection updates            ▼                             │
  │    model NOT updated          model updated in context           │
  │                               error state cleared                │
  └──────────────────────────────────────────────────────────────────┘
```

Spec traceability: FR-06, FR-07, FR-08 · AC-05, AC-06 · NFR-02

---

### 4. Component interactions

This shows which components communicate with which, and what each exchange carries.

```
  DiagramEditorContextProvider
  ┌───────────────────────────────────────────────────────────────┐
  │  model: Specification.Workflow | null                         │
  │  isReadOnly: boolean                                          │
  │  updateTask(nodeId, updatedTask)  ◄──────────────────────┐   │
  └─────────────────────────┬─────────────────────────────────┼───┘
                            │ provides context                 │
                            ▼                                  │
                     SidePanel                                 │
                     ┌────────────────────────────────────┐   │
                     │ SidebarContent                      │   │
                     │   │ selectedNode, isReadOnly         │   │
                     │   ▼                                 │   │
                     │ NodeDetailsView                     │   │
                     │   │                                 │   │
                     │   ├── isReadOnly=true               │   │
                     │   │     Static field list           │   │
                     │   │     ErrorSection (SDK errors)   │   │
                     │   │     YamlField                   │   │
                     │   │                                 │   │
                     │   └── isReadOnly=false              │   │
                     │         TaskEditForm ───────────────┼───┘  ④ updateTask call
                     │           │                         │
                     │           ├── onBlur ①              │
                     │           │   Validation core       │
                     │           │   validateField         │
                     │           │   ② errors              │
                     │           │   local error map       │
                     │           │   field red-border      │
                     │           │   ErrorSection          │
                     │           │                         │
                     │           └── onApply ①             │
                     │               Validation core       │
                     │               validateTask          │
                     │               ② errors              │
                     │               local error map       │
                     │               field red-borders     │
                     │               ErrorSection          │
                     └────────────────────────────────────┘
                     ┌────────────────────────────────────┐
                     │ SidebarFooter  (sticky, always      │
                     │ visible — AD-06)                    │
                     │                                     │
                     │  node selected + isReadOnly=false → │
                     │    [Apply]  [Cancel]                │
                     │                                     │
                     │  no node selected + isReadOnly=false│
                     │    → MermaidActions                 │
                     │                                     │
                     │  isReadOnly=true → (empty / hidden) │
                     └────────────────────────────────────┘
```

**Exchange summary**

| From                   | To                                      | What is exchanged                                                                                                                                                  |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DiagramEditorContext` | `NodeDetailsView`                       | `isReadOnly`, `node.data.task` (via selected node)                                                                                                                 |
| `NodeDetailsView`      | `TaskEditForm`                          | `node`, `isReadOnly` (as render gate — `TaskEditForm` only mounts when `false`)                                                                                    |
| `TaskEditForm`         | Validation core (`getFieldDescriptors`) | `taskType` on mount → `FieldDescriptor[]` (field list and control types)                                                                                           |
| `TaskEditForm`         | Validation core                         | `(fieldName, value)` on blur; `(localFieldValues)` on Apply                                                                                                        |
| Validation core        | `TaskEditForm`                          | `ErrorItem[]` (zero or more)                                                                                                                                       |
| `TaskEditForm`         | `ErrorSection`                          | `ErrorItem[]` (current error map as flat array)                                                                                                                    |
| `TaskEditForm`         | `DiagramEditorContext`                  | `(nodeId, updatedTask)` via `updateTask` — only on successful Apply                                                                                                |
| `SidePanel`            | `SidebarFooter`                         | Apply + Cancel buttons (when node selected and `isReadOnly = false`); `MermaidActions` (when no node and `isReadOnly = false`); nothing (when `isReadOnly = true`) |

---

### 5. Data movement across components

This traces the lifecycle of two key data objects as they move through the system.

#### 5.1 Field values

```
  node.data.task (committed model)
       │
       │  panel opens
       ▼
  local field snapshot  ──────────────────────────── held in TaskEditForm state
       │
       │  user edits
       ▼
  local field values (in-progress)  ──────────────── held in TaskEditForm state
       │                                              never in context
       │
       ├── on blur:  passed to validateField (read-only copy)
       │
       ├── on Apply (errors):  NOT committed; local values remain unchanged
       │
       └── on Apply (no errors):  passed to updateTask → committed to model
                                  local snapshot updated to match
       │
       └── on Cancel:  local values replaced by snapshot; snapshot unchanged
```

#### 5.2 Field descriptors

```
   JSON Schema sub-schema for taskType
        │
        │  schemaRegistry resolves sub-schema
        │  taskValidator.getFieldDescriptors(taskType)
        ▼
   FieldDescriptor[]  { name, label, type, required, constraints }
        │
        │  passed to TaskEditForm on mount
        │  held in local state for the lifetime of the panel
        │
        ├── name     → key used in localFieldValues map
        ├── label    → control label text
        ├── type     → determines which input control renders
        └── required → (optional) visual indicator
        │
        ▼
   TaskEditForm renders one generic control per descriptor
   No field name or control type is declared statically in JSX
   Adding a field to the schema = adding a descriptor = new control appears automatically
```

#### 5.3 Validation errors

```
  Validation library output  (library-specific error objects)
       │
       │  errorNormalizer
       ▼
  ErrorItem[]  { field: string, message: string }
       │
       │  stored in local error map  (keyed by field name)
       │
       ├── on blur:  map entry for that field is set or cleared
       │
       └── on Apply:  entire map is replaced by the new error set
                      (or cleared on success)
       │
       ▼
  ErrorSection receives flat array of all current ErrorItems
  Field controls receive red-border class based on error map keys
```

---

### 6. Traceability

| Spec requirement                                               | Design element                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 — read-only: no edit controls, no buttons, no validation | `NodeDetailsView` does not mount `TaskEditForm` when `isReadOnly = true`; `SidebarFooter` renders nothing in read-only mode; validation core is not called |
| FR-02 — edit mode: editable fields + Apply + Cancel rendered   | `TaskEditForm` renders controls from `FieldDescriptor[]`; Apply + Cancel rendered by `SidePanel` in `SidebarFooter` (AD-06)                                |
| FR-03 — field blur triggers field validation                   | `TaskEditForm.onBlur` calls `validateField`                                                                                                                |
| FR-04 — blur errors: red border + `ErrorSection` entries       | error map updated; red-border class applied; `ErrorSection` re-renders                                                                                     |
| FR-05 — blur valid: prior errors cleared                       | error map entry for field removed; red-border class removed                                                                                                |
| FR-06 — Apply triggers full-task validation                    | `TaskEditForm.onApply` calls `validateTask`                                                                                                                |
| FR-07 — Apply errors: fields highlighted, model not updated    | error map replaced; red-border applied to offending fields; `updateTask` not called                                                                        |
| FR-08 — Apply no errors: change committed                      | `updateTask(nodeId, localFieldValues)` called; error state cleared                                                                                         |
| FR-09 — Cancel: edits discarded, errors cleared                | local values reset to snapshot; error map cleared                                                                                                          |
| FR-10 — task type field always non-editable                    | `TaskEditForm` excludes task type key from editable controls at render time                                                                                |
| FR-11 — validation API is standalone and callable              | validation core is a pure TypeScript module; `validateTask` and `validateField` are named exports with no React or diagram dependencies                    |
| NFR-01 — field validation ≤ 200 ms                             | `validateField` is called synchronously on blur; no async path                                                                                             |
| NFR-02 — task validation ≤ 500 ms                              | `validateTask` is called synchronously on Apply; no async path                                                                                             |
| NFR-03 — use existing `ErrorSection` / `ErrorItem`             | `errorNormalizer` maps all library errors to `ErrorItem`; `TaskEditForm` passes them to `ErrorSection`                                                     |
| NFR-04 — zero validation calls when `isReadOnly = true`        | `TaskEditForm` not mounted in read-only mode                                                                                                               |
| NFR-05 — validation core decoupled                             | `src/core/validation/` has no React, SDK, or store imports                                                                                                 |
| NFR-06 — backward compatibility                                | `NodeDetailsView` read-only branch is unchanged; no existing tests affected                                                                                |
| NFR-07 — action buttons always visible                         | Apply + Cancel rendered in `SidebarFooter` (sticky-pinned); never scroll out of view (AD-06)                                                               |
| NFR-08 — schema version agnosticism                            | `getFieldDescriptors` derives field list from schema; `TaskEditForm` has no static field declarations; schema file update is the only change path          |
| FR-12 — schema-driven field rendering                          | `TaskEditForm` renders controls from `FieldDescriptor[]` returned by `getFieldDescriptors`; control type mapped from `FieldDescriptor.type` (AC-11)        |

---

## Low-Level Design

### 1. Overview

This section specifies the internal shape of the four public API functions — `getFieldDescriptors`, `validateField`, `validateTask`, and `validate` — the `FieldDescriptor` type, and the normalisation contract between AJV and the `ErrorItem` type used by the rest of the editor.

All functions are implemented in [`validator.ts`](../../src/core/validation/validator.ts). The LLD below reflects the implemented behaviour.

> **SDK target:** The design of `validateField`, `validateTask`, and `getFieldDescriptors` is the reference proposal for the functions to be added to the OWF TypeScript SDK. See [VALIDATION_SPIKE.md](./VALIDATION_SPIKE.md).

---

### 2. Validation API

> **Architecture traceability:** §4.1 (Validation core), §7 AD-01 (library selection), AD-04 (schema location), AD-07 (schema-driven form)
> **Spec traceability:** FR-11, FR-12, NFR-03, NFR-05, NFR-08, AC-08, AC-10, AC-11

The validation core lives entirely in `src/core/validation/` and is a pure TypeScript module — no React, no React Flow, no `@openworkflowspec/sdk`, no DOM dependency (spec NFR-05, architecture §4.1).

It exposes three public functions. All other internals are private to the module.

---

#### 2.1 `validateTask`

**Purpose:** Validate a complete task object against the OWF JSON Schema sub-schema for its task type and return all constraint violations.

**Actual signature:**

```ts
validateTask(taskType: string, task: object): ErrorItem[]
```

| Aspect       | Detail                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Input        | `taskType` — OWF task type key (e.g. `"set"`, `"wait"`). `task` — the full in-progress task object with current field values. |
| Output       | `ErrorItem[]`. Empty array means valid.                                                                                       |
| Side effects | None. Stateless. AJV validator compiled per task type is cached.                                                              |
| Sync / async | Synchronous (spec NFR-02: ≤ 500 ms).                                                                                          |

**Behaviour:**

1. Resolves the task sub-schema from `schemaRegistry` using `taskType`.
2. Wraps the sub-schema with the full `$defs` bundle so internal `$ref` chains resolve (e.g. `callTask → endpoint → uriTemplate`).
3. Compiles an AJV validator (cached by `taskType`); runs it against the full task object.
4. Passes raw AJV `ErrorObject[]` through `errorNormalizer` and returns `ErrorItem[]`.
5. If `taskType` is unknown or no sub-schema is found, returns a single descriptive `ErrorItem` (fail-safe).

**Traceability:**

| Requirement                                                             | How satisfied                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FR-06 — Apply triggers full-task validation                             | `TaskEditForm.onApply` calls this function                                               |
| FR-07 — Apply errors: fields highlighted, model not updated             | Non-empty return causes `TaskEditForm` to update error state; `updateTask` is not called |
| FR-08 — Apply no errors: change committed                               | Empty return causes `TaskEditForm` to call `context.updateTask`                          |
| FR-11 — validation API is standalone                                    | Named export; no React or diagram imports                                                |
| NFR-02 — task validation ≤ 500 ms                                       | Synchronous execution path                                                               |
| NFR-05 — validation core decoupled                                      | No external runtime dependencies beyond schema files and the chosen library              |
| AC-08 — calling `validateTask` with a valid task returns an empty array | Guaranteed by the stateless, synchronous contract                                        |

---

#### 2.2 `validateField`

**Purpose:** Validate a single scalar field value in isolation against the constraint for that field in the OWF JSON Schema for the given task type, and return any violations.

**Actual signature:**

```ts
validateField(taskType: string, fieldName: string, value: unknown, taskObj?: Record<string, unknown>): ErrorItem[]
```

| Aspect       | Detail                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input        | `taskType`, `fieldName`, `value` — the scalar being validated. Optional `taskObj` is the full task object, used to resolve `oneOf` discriminators for `call`/`run`/`listen` tasks. |
| Output       | `ErrorItem[]`. Empty array means valid or field has no constraint.                                                                                                                 |
| Side effects | None. Stateless. AJV validator compiled per field/type combination is cached.                                                                                                      |
| Sync / async | Synchronous (spec NFR-01: ≤ 200 ms).                                                                                                                                               |

**Behaviour:**

1. Resolves the property sub-schema for `fieldName` within the task sub-schema (handles `allOf`/`oneOf` variant resolution via `taskObj` discriminator when present).
2. Wraps the property sub-schema with the full `$defs` bundle; compiles a standalone AJV validator (cached with a discriminator-aware cache key).
3. Evaluates `value` against the compiled validator.
4. Passes raw AJV errors through `errorNormalizer` with `fieldName` as the field override.
5. If `fieldName` is absent from the schema or carries no constraints, returns `[]`.
6. Task type discriminator fields are never passed to this function — excluded by `TaskEditForm` at render time (AD-05).

> **A-02 confirmed:** Per-field targeting is feasible. `$defs` sub-schemas are self-contained; `$ref` resolution is handled by embedding `$defs` at compile time.

**Traceability:**

| Requirement                                                                 | How satisfied                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FR-03 — field blur triggers field validation                                | `TaskEditForm.onBlur` calls this function                                                |
| FR-04 — blur errors: red border + `ErrorSection`                            | Non-empty return updates error map; `TaskEditForm` applies red-border class              |
| FR-05 — blur valid: prior errors cleared                                    | Empty return removes error map entry for that field                                      |
| FR-11 — validation API is standalone                                        | Named export; no React or diagram imports                                                |
| NFR-01 — field validation ≤ 200 ms                                          | Synchronous execution path                                                               |
| NFR-04 — zero validation calls when `isReadOnly = true`                     | `TaskEditForm` is not mounted in read-only mode; this function is therefore never called |
| AC-08 — calling `validateField` with an invalid value returns `ErrorItem[]` | Guaranteed by the normalisation contract                                                 |

---

### 3. Error normaliser

> **Architecture traceability:** §4.1 (Validation core, `errorNormalizer.ts`), AD-01 (AJV selected)
> **Spec traceability:** NFR-03, OQ-03 (resolved)

`errorNormalizer` is internal to the validation core — not part of the public API. Called by `validateTask`, `validateField`, and `validate`. It is the only file in the validation core that is aware of AJV's `ErrorObject` shape.

**Implemented contract:**

| Aspect       | Detail                                                                              |
| ------------ | ----------------------------------------------------------------------------------- |
| Input        | AJV `ErrorObject[]` (or `null`/`undefined`) and an optional `fieldOverride` string. |
| Output       | `ErrorItem[]` — `{ field: string, message: string }`.                               |
| Side effects | None.                                                                               |

**Normalisation rules (as implemented):**

| AJV error property   | Maps to `ErrorItem` field | Notes                                                                                                                                                                                                                                          |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instancePath`       | `field`                   | Converted to dot-notation (e.g. `/with/operationId` → `with.operationId`). `fieldOverride` takes precedence when set (used by `validateField`). For workflow-level validation, numeric array indices are stripped so paths match SDK node IDs. |
| `keyword` + `params` | `message`                 | Translated to plain English: `minLength` → "Must be at least N characters long.", `type` → "Must be of type X.", `required` → "Required field \"X\" is missing.", etc. Unmapped keywords fall back to `error.message`.                         |

**Constraints:**

- The `ErrorItem` type is **not extended**. No additional properties are added to the output objects (spec NFR-03).
- If the raw error collection is empty or undefined, the normaliser returns an empty array.
- The normaliser does not throw. Errors that cannot be mapped produce a fallback `ErrorItem` with `field: "unknown"` and a generic message, so that the caller always receives a typed result.

---

### 4. Schema lookup contract

> **Architecture traceability:** §4.1, AD-04 (schema location), AD-01 (AJV, Option A)
> **Spec traceability:** FR-11 (validation API decoupled), NFR-05

`workflow.json` is loaded once at module load time via a static import in `schemaRegistry.ts`. No network fetch. The core is importable in Node.js (Vitest) without a DOM (spec NFR-05, AC-08).

**Lookup behaviour (as implemented):**

| Scenario                                            | Behaviour                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Task type is known and sub-schema exists in `$defs` | Sub-schema returned by `getSubSchema`; used by both `validateTask` and `validateField`.      |
| Task type is known but `$defs` entry is missing     | `validateTask` returns a single `ErrorItem`. `validateField` returns `[]`.                   |
| Field name not present in sub-schema                | `validateField` returns `[]` (no constraint → any value accepted).                           |
| Field is present but carries no scalar constraints  | `validateField` returns `[]`.                                                                |
| Schema malformed or AJV compilation fails           | Both functions catch the exception and return a single descriptive `ErrorItem`. Never throw. |

**AJV sub-schema strategy (Option A — confirmed):**

Task sub-schemas in `$defs` (e.g. `setTask`, `waitTask`) are self-contained and can be compiled by AJV independently. The full `$defs` bundle is embedded alongside the sub-schema so internal `$ref` chains resolve correctly. This is the mechanism used by both `validateTask` and `validateField`.

---

### 5. API summary

| Function                                              | Caller                              | Trigger         | Actual signature                                                            | Output                  |
| ----------------------------------------------------- | ----------------------------------- | --------------- | --------------------------------------------------------------------------- | ----------------------- |
| `getFieldDescriptors(taskType, taskObj?)`             | `TaskEditForm`                      | Component mount | `(taskType: string, taskObj?: Record<string, unknown>) → FieldDescriptor[]` | Field list for the form |
| `validateField(taskType, fieldName, value, taskObj?)` | `TaskEditForm` `handleBlur`         | Field blur      | `(taskType, fieldName, value, taskObj?) → ErrorItem[]`                      | Per-field errors        |
| `validateTask(taskType, task)`                        | `TaskEditForm` `handleApply`        | Apply click     | `(taskType: string, task: object) → ErrorItem[]`                            | Full-task errors        |
| `validate(workflow)`                                  | `workflowSdk.ts` `validateWorkflow` | Model reload    | `(workflow: object) → ErrorItem[]`                                          | Workflow-level errors   |

All functions are **named exports** from `validator.ts` (spec FR-11). No default export. Validators compiled by AJV are cached to avoid re-compilation on every call.

---

### 6. Traceability to spec and architecture

| LLD element                                                             | Spec requirement                                  | Architecture decision               |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| `getFieldDescriptors` — derives field list from schema at runtime       | FR-12, NFR-08, AC-10, AC-11                       | AD-07                               |
| `validateTask(taskType, task)` — full task validation gate on Apply     | FR-06, FR-07, FR-08, FR-11, NFR-02, NFR-05, AC-08 | AD-01 (AJV)                         |
| `validateField(taskType, fieldName, value)` — per-field blur validation | FR-03, FR-04, FR-05, FR-11, NFR-01, NFR-04, AC-08 | AD-01 (AJV), AD-05                  |
| `validate(workflow)` — full workflow validation after Apply             | Workflow-level consistency                        | `workflowSdk.ts` `validateWorkflow` |
| `errorNormalizer` — AJV → `ErrorItem[]` translation                     | NFR-03, OQ-03 (resolved)                          | AD-01 (AJV), §4.1                   |
| `schemaRegistry` — static import of `workflow.json`                     | FR-12, NFR-08                                     | AD-04 (interim schema copy)         |
| Schema lookup — `$defs` sub-schema + embedded bundle                    | FR-11, FR-12, NFR-05, A-02 (confirmed)            | AD-04, AR-01 (resolved)             |
| Stateless, synchronous, cached validators                               | NFR-01, NFR-02                                    | §4.1, §6                            |
| No React / SDK / store imports                                          | NFR-05                                            | §4.1, AD-04                         |
| `ErrorItem` type not extended                                           | NFR-03                                            | §4.1                                |
| `FieldDescriptor` + `FieldConstraints` types in `types.ts`              | FR-12, AD-07                                      | §4.1                                |
| Task type field excluded from editable descriptors                      | FR-10                                             | AD-05                               |
| Fail-safe on unknown type or missing schema                             | — (defensive design)                              | AR-01 (resolved)                    |
