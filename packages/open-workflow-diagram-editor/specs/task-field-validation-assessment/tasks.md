# Tasks — Task Field Validation (Feasibility Spike / PoC)

> **Related spec:** [feature-spec.md](./feature-spec.md)
> **Architecture:** [architecture.md](./architecture.md)
> **Design:** [design.md](./design.md)
> **Plan:** [plan.md](./plan.md)
> **Status:** Complete — all tasks delivered

---

## Overview

Tasks are ordered by dependency — each task can begin only after all tasks listed under its **Dependencies** field are complete. Tasks within the same layer that have no dependency on each other may be worked in parallel.

All tasks are frontend tasks scoped to the PoC deliverable. No backend tasks exist for this feature.

---

## Task index

| ID              | Title                                                                                      | Layer                 | Status  |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------- | ------- |
| [FE-00](#fe-00) | Evaluate validation library candidates and produce a shortlist                             | 0 — Library selection | ✅ Done |
| [FE-01](#fe-01) | Spike — inspect OWF JSON Schema structure and select validation library                    | 1 — Research          | ✅ Done |
| [FE-02](#fe-02) | Copy OWF JSON Schema files into `src/core/validation/schema/`                              | 2 — Schema setup      | ✅ Done |
| [FE-03](#fe-03) | Implement `schemaRegistry` — sub-schema resolution by task type                            | 3 — Validation core   | ✅ Done |
| [FE-04](#fe-04) | Implement `errorNormalizer` — normalise library errors to `ErrorItem[]`                    | 3 — Validation core   | ✅ Done |
| [FE-05](#fe-05) | Implement `validator` — `getFieldDescriptors`, `validateTask`, `validateField`, `validate` | 3 — Validation core   | ✅ Done |
| [FE-06](#fe-06) | Add `updateTask` action to `DiagramEditorContext` and `DiagramEditorContextProvider`       | 4 — Context           | ✅ Done |
| [FE-07](#fe-07) | Build `TaskEditForm` — schema-driven generic form renderer with local edit state           | 5 — UI                | ✅ Done |
| [FE-08](#fe-08) | Modify `NodeDetailsView` — branch on `isReadOnly` to mount `TaskEditForm` or static list   | 5 — UI                | ✅ Done |
| [FE-09](#fe-09) | Modify `SidePanel` — render Apply / Cancel in `SidebarFooter` conditionally                | 5 — UI                | ✅ Done |

---

## Tasks

---

### FE-00 ✅ Done

**Evaluate validation library candidates and produce a shortlist**

#### Source reference

- feature-spec.md §1 — "The preferred approach is to consume the JSON Schema directly… If direct consumption proves infeasible, deriving a schema with a TypeScript-first library is the fallback."
- plan.md §"Key Decisions and Rationale" AD-01 — "Validation library selection is deferred to the spike"
- architecture.md §7 AD-01 — Option A (JSON Schema-native) vs. Option B (TypeScript-first)

#### Context

The validation core must support two usage patterns:

1. **Task-level validation** (`validateTask`) — validate a full task object against a task-type sub-schema derived from the OWF JSON Schema.
2. **Field-level validation** (`validateField`) — validate a single scalar value against the constraint for a named field in a specific task-type sub-schema.

The OWF JSON Schema is the authoritative source. Any library selected must either consume it directly or provide a reliable, low-maintenance derivation path from it.

#### Candidate libraries

Evaluate all five candidates below. Do not discard any before completing the scoring step.

| ID  | Library      | Approach                       | Key claim                                                                                                                                                            |
| --- | ------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **ajv** (v8) | JSON Schema-native validator   | Directly consumes JSON Schema draft-07/2019-09/2020-12; no schema translation required                                                                               |
| B   | **TypeBox**  | JSON Schema + static inference | Builds in-memory JSON Schema objects; validates via ajv internally; native JSON Schema compatibility                                                                 |
| C   | **Valibot**  | TypeScript-first, modular      | Tree-shakeable; ~1 KB gzipped for basic validators; functional API                                                                                                   |
| D   | **ArkType**  | TypeScript type-string syntax  | Schema written as TypeScript literal strings; strong compiler integration                                                                                            |
| E   | **Typia**    | AOT compiler plugin            | Generates validation code at build time from native TypeScript interfaces; 10–100× faster at runtime than runtime-eval libraries; requires a compiler transform step |

#### Evaluation criteria

Score each candidate against the criteria below. Use a three-point scale: ✅ Meets / ⚠️ Partial / ❌ Does not meet.

| #   | Criterion                                                                                                                                                                | Weight | Rationale                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------- |
| C1  | **JSON Schema consumption** — can validate directly against the OWF JSON Schema sub-schemas without a hand-written translation layer                                     | High   | The schema must be the single change-point (NFR-08); a manual derived schema is a maintenance burden |
| C2  | **Sub-schema targeting at field granularity** — can isolate and validate a single property constraint without evaluating the full task object                            | High   | Required by `validateField`; if false for Option A the candidate falls to Option B                   |
| C3  | **Error normalisation surface** — produces structured errors with a path/field reference and a message; can be normalised to `ErrorItem` without complex post-processing | High   | `errorNormalizer.ts` must produce `{ field, message }` cleanly                                       |
| C4  | **Bundle size impact** — added weight to the editor bundle                                                                                                               | Medium | The editor is an embeddable component; large dependencies affect host applications                   |
| C5  | **No build-time tooling requirement** — works without compiler plugins, Babel transforms, or code generation steps in the editor build pipeline                          | Medium | The editor uses Vite; introducing an AOT compiler step adds integration risk                         |
| C6  | **Active maintenance** — last release within 6 months; issues triaged within 30 days                                                                                     | High   | Security policy requirement; EOL packages are prohibited                                             |
| C7  | **TypeScript inference quality** — infers static types from the schema definition; no `any` leakage                                                                      | Low    | Nice-to-have for `FieldDescriptor` derivation; not a blocker                                         |

#### Implementation notes

1. Tabulate each candidate against the seven criteria to produce a scored comparison matrix.
2. Identify which candidates satisfy C1 + C2 + C3 + C5 + C6 simultaneously — these are viable. A candidate failing C5 (Typia) may still be noted as a future option if the build pipeline is extended, but must not be recommended for this PoC.
3. Among viable candidates, rank by bundle size (C4) and TypeScript quality (C7).
4. Recommend **one library** as the primary choice and, if relevant, note one fallback. The recommendation must state:
   - The library name and latest stable version at time of evaluation.
   - Which of C1–C7 it meets, partially meets, or does not meet, and why.
   - Whether it is Option A (JSON Schema-native) or Option B (TypeScript-first derived schema).
   - Whether any notable edge case for `validateField` (single-property sub-schema extraction) requires a workaround.
5. Record the output as `spike-findings.md` in `delivery/specs/task-field-validation-assessment/`. The findings file must include the full scoring matrix so the decision is auditable.
6. Do not write any validation implementation code in this task.

#### Outcome

**Library selected: AJV v8 (`ajv/dist/2020`), Option A.**

Scored matrix summary:

- AJV: ✅ C1 (JSON Schema-native), ✅ C2 (field-level sub-schema via `$defs` extract + embed), ✅ C3 (structured `ErrorObject[]` with `instancePath`/`keyword`/`params`), ✅ C4 (~50 KB gzip, acceptable for an embeddable component), ✅ C5 (no build-time tooling), ✅ C6 (actively maintained — v8.17.x, releases within the last 30 days), ⚠️ C7 (runtime typing only, no static inference from JSON Schema).
- TypeBox: ✅ C1, ⚠️ C2 (requires manual schema wrapping), ✅ C3, ✅ C4, ✅ C5, ✅ C6, ✅ C7.
- Valibot / ArkType: ❌ C1 (no native JSON Schema consumption), not pursued.
- Typia: ❌ C5 (requires compiler plugin), not suitable for the editor Vite build.

AJV is the clear Option A winner. TypeBox is a viable future alternative if static inference becomes important.

#### Dependencies

None. This is the first task.

---

### FE-01 ✅ Done

**Spike — inspect OWF JSON Schema structure and confirm library fit**

#### Source reference

- plan.md §"Technical Context" — "The spike must determine whether that schema exposes per-task-type sub-schemas suitable for field-level targeting"
- plan.md §"Key Decisions and Rationale" — AD-01 — "Validation library selection is deferred to the spike"
- architecture.md §7 AD-01, AR-01, AR-02

#### Implementation notes

1. Check out or browse the OWF SDK schema directory at `sdk-typescript/src/lib/generated/schema`.
2. Answer assumption A-02: does the schema expose per-task-type sub-schemas that allow field-level constraints (`type`, `format`, `required`, `enum`, `minLength`, etc.) to be targeted in isolation without the full workflow context?
3. Using the library recommended in FE-00:
   - Confirm that it can resolve the relevant task sub-schema and validate a single field property against it.
   - Confirm that it can validate a complete task object against the task-type sub-schema without requiring the surrounding workflow structure.
   - If A-02 is false or the recommended library cannot support field-level targeting (C2 failure on real schema), escalate before proceeding — do not begin FE-03 until the gap is resolved.
4. If the FE-00 recommendation was Option A (JSON Schema-native) but the schema structure makes field-level targeting infeasible, fall back to the Option B candidate identified in `spike-findings.md`. Document this decision.
5. Extend `spike-findings.md` with schema-inspection findings:
   - Whether A-02 holds and how sub-schemas are structured (e.g. `oneOf`, `discriminator`, `$ref` chains).
   - How `validateField` will target a single field's constraint — the exact lookup strategy with the chosen library.
   - Whether schema property definitions carry `title` annotations for labels (answers OQ-04, needed by FE-05).
6. Do not write any implementation code in this task.

#### Outcome

**A-02: Confirmed true.**

- The OWF schema uses JSON Schema 2020-12 with a `$defs` structure. Each task type (e.g. `setTask`, `waitTask`, `callTask`) has a self-contained sub-schema in `$defs` using `allOf` to merge `taskBase` (common fields) with task-specific properties.
- AJV can compile a sub-schema directly when the full `$defs` bundle is embedded alongside it (using `{ $schema, $defs, ...subSchema }`). This is the strategy used by `validateField` and `validateTask` in `validator.ts`.
- `validateField` resolves the property sub-schema for `fieldName` by traversing `allOf` and `properties`, then compiles a standalone AJV validator for that single property constraint. Cache key includes a discriminator derived from the task object to handle `oneOf` variant selection in `call`/`run`/`listen` tasks.
- `title` annotation coverage is sparse. The `camelToLabel` fallback transform is applied in `validator.ts`.
- AJV selection from FE-00 is confirmed. No fallback to Option B was needed.

#### Dependencies

- FE-00 (library shortlist and recommendation available in `spike-findings.md`)

---

### FE-02 ✅ Done

**Copy OWF JSON Schema into `src/core/validation/schema/`**

#### Source reference

- plan.md §"New components" — schema files row: "`src/core/validation/schema/` — OWF JSON Schema files — the only files that change when the specification evolves"
- architecture.md §7 AD-04 — "Schema files live in `src/core/validation/schema/`"
- plan.md §"Key Decisions and Rationale" AD-04 — "Schema files are copied into the repository"

#### Implementation notes

1. Create the directory `src/core/validation/schema/` if it does not exist.
2. Copy the relevant OWF JSON Schema files from `sdk-typescript/src/lib/generated/schema` into this directory. Copy the minimum set required to support at least two task types (enough to demonstrate schema-driven rendering per AC-10).
3. Do not import these files from `@openworkflowspec/sdk` at runtime — they must be static assets referenced by module import (architecture AD-04, spec NFR-05).
4. Confirm that the files can be imported in a Node.js (no-DOM) test environment after copy.
5. No transformation of the schema files is permitted in this task; they are copied verbatim.

#### Expected output

- `src/core/validation/schema/` directory containing the copied JSON Schema files.
- At least two task type sub-schemas present (enough for FE-05 tests to cover multiple types).

#### Completion criteria

- The directory exists and contains at least two task-type schema files.
- Each file is importable as a static module in TypeScript.
- No `@openworkflowspec/sdk` import is introduced.

#### Dependencies

- FE-01 (spike findings confirm which schema files are needed and whether their structure supports field-level targeting)

---

### FE-03 ✅ Done

**Implement `schemaRegistry` — sub-schema resolution by task type**

#### Source reference

- plan.md §"New components" — `schemaRegistry` row: "Loads schema files and resolves the sub-schema for a given task type. Used by both `taskValidator` and `getFieldDescriptors`."
- architecture.md §4.1 — sub-structure diagram showing `schemaRegistry.ts`
- design.md LLD §4 — "Schema lookup contract"

#### Implementation notes

1. Create `src/core/validation/schemaRegistry.ts`.
2. The module's single responsibility is to map a task type string to the corresponding JSON Schema sub-schema object loaded from `src/core/validation/schema/`.
3. Implement the lookup behaviour exactly as specified in design.md LLD §4:
   - Known task type with a matching sub-schema → return the sub-schema.
   - Known task type but no sub-schema found → return `null` (caller handles this as a fail-safe, not a throw).
   - Schema files absent or malformed → return `null` (do not throw).
4. This module has no React, no SDK, no store, and no DOM dependency (spec NFR-05).
5. All schema files are referenced at module load time (static imports or synchronous `require`) — no network fetch, no `fs.readFile` (architecture AD-04).
6. Expose a single named export function, e.g. `getSubSchema(taskType: string): JSONSchema | null`. The exact name may be adjusted during implementation.

#### Expected output

- `src/core/validation/schemaRegistry.ts` with the named export function.
- The function returns the correct sub-schema for a known task type.
- The function returns `null` for an unknown task type without throwing.

#### Completion criteria

- `getSubSchema("knownTaskType")` returns a non-null object with at least a `properties` key.
- `getSubSchema("unknownTaskType")` returns `null`.
- No runtime exceptions are thrown for any input.
- No external dependencies introduced beyond the chosen validation library (from FE-01) and the schema files.
- The module is importable in a Vitest (Node.js) environment with no DOM.

#### Dependencies

- FE-01 (library selection and schema structure confirmed)
- FE-02 (schema files present in `src/core/validation/schema/`)

---

### FE-04 ✅ Done

**Implement `errorNormalizer` — normalise library errors to `ErrorItem[]`**

#### Source reference

- plan.md §"New components" — `errorNormalizer` row: "Maps library-specific error objects to `ErrorItem[]`. The only file that is aware of the chosen library's error shape."
- architecture.md §4.1 — "`errorNormalizer.ts` — maps library-specific error output → `ErrorItem[]`"
- design.md LLD §3 — "Error normaliser"

#### Implementation notes

1. Create `src/core/validation/errorNormalizer.ts`.
2. Implement the normalisation rules from design.md LLD §3:
   - Map the library's error path/instance path to `ErrorItem.field` (flatten dot-notation paths to the leaf field name for scalar errors, e.g. `"task.name"` → `"name"`).
   - Map the library's error message or keyword to a plain human-readable `ErrorItem.message` (translate machine keywords such as `"minLength"` to sentences such as `"Must be at least N characters"`).
3. The `ErrorItem` type is not extended — the output must conform to the existing `{ field: string, message: string }` shape in `src/side-panel/ErrorsSection.tsx` (spec NFR-03).
4. Implement the fail-safe: errors that cannot be mapped produce `{ field: "unknown", message: "<descriptive fallback>" }` — never throw.
5. An empty or undefined input returns an empty array.
6. This is the only file in the validation core that is aware of the chosen library's error shape. All other validation core modules call through this normaliser.
7. No React, SDK, store, or DOM dependency (spec NFR-05).

#### Expected output

- `src/core/validation/errorNormalizer.ts` with a named export function, e.g. `normalizeErrors(rawErrors): ErrorItem[]`.
- The function correctly maps at least the error shapes produced by the chosen library for `type`, `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, and `enum` keywords.

#### Completion criteria

- Given a library error for a `minLength` violation on field `"name"`, the normaliser returns `[{ field: "name", message: "Must be at least N characters" }]` (or equivalent plain-English phrasing).
- Given an empty input, the normaliser returns `[]`.
- Given an unmappable error, the normaliser returns `[{ field: "unknown", message: "<fallback>" }]` without throwing.
- The output type is `ErrorItem[]` with no additional properties.
- Module is importable in Vitest (Node.js) with no DOM.

#### Dependencies

- FE-01 (library selected — normaliser must target the chosen library's error shape)

---

### FE-05 ✅ Done

**Implement `validator` — `getFieldDescriptors`, `validateField`, `validateTask`, `validate`**

#### Source reference

- plan.md §"New components" — `validator` row
- plan.md §"Interfaces and Integrations" — "Validation core public API" table
- architecture.md §4.1 — full responsibilities and sub-structure
- design.md LLD §2 — `validateTask` and `validateField` contracts
- design.md LLD §5 — API summary

#### Implementation notes

1. ~~Create `src/core/validation/taskValidator.ts`.~~ **Implemented as `validator.ts`.**
2. Implements and exports four named functions — `getFieldDescriptors`, `validateField`, `validateTask`, and `validate`.

**`getFieldDescriptors(taskType: string): FieldDescriptor[]`**

- Call `schemaRegistry.getSubSchema(taskType)` to obtain the task sub-schema.
- Enumerate the scalar properties in the sub-schema's `properties` object; skip array and object types (spec A-04, §3 out-of-scope).
- Exclude the task type discriminator field from the returned descriptors (spec FR-10, architecture AD-05; reference the existing `TASK_BASE_KEYS` pattern in `src/core/taskDetails.ts`).
- For each remaining scalar property, build a `FieldDescriptor`:
  - `name` — the property key.
  - `label` — the `title` annotation if present; otherwise the property key transformed to human-readable text (camelCase → "Camel Case"; decision per OQ-04 recorded in spike findings from FE-01).
  - `type` — `"string"`, `"number"`, or `"boolean"` derived from the `type` keyword in the property schema.
  - `required` — `true` if the property key is in the sub-schema's `required` array.
  - `constraints` — extract `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `enum` as present.
- If `taskType` is not found or has no scalar fields, return `[]`.
- Do not throw.

**`validateTask(task: object): ErrorItem[]`**

- Identify the task type discriminator from `task`.
- Call `schemaRegistry.getSubSchema(taskType)` to select the sub-schema.
- Run the validation library against the full task object using that sub-schema.
- Pass raw errors through `errorNormalizer.normalizeErrors` and return the result.
- If task type cannot be determined or no sub-schema is found, return a single descriptive `ErrorItem` (fail-safe, design.md LLD §2.1 behaviour rule 5).
- Do not throw.

**`validateField(taskType: string, fieldName: string, value: unknown): ErrorItem[]`**

- Accept `taskType` as the first argument. The caller (`TaskEditForm`) holds the task type from the editing context — the user selected a specific task node and its type is known at form-mount time. The function must not attempt to infer the task type itself.
- Call `schemaRegistry.getSubSchema(taskType)` to obtain the sub-schema for that task type.
- Locate the constraint schema for `fieldName` within that sub-schema's `properties` object.
- Run the validation library against `value` using the field's constraint sub-schema.
- Pass raw errors through `errorNormalizer.normalizeErrors` and return the result.
- If `taskType` is unknown, `fieldName` is not in the sub-schema, or the field carries no constraints, return `[]` (design.md LLD §2.2 behaviour rules 4–5).
- Do not throw.

3. Define the `FieldDescriptor` type in `src/core/validation/types.ts`. Re-export it from `taskValidator.ts` so callers have a stable import path (`import type { FieldDescriptor } from "@/core/validation/types"`). It is the only new type introduced. The shape is defined in architecture.md §4.1.
4. No React, SDK, React Flow, store, or DOM dependency (spec NFR-05).

#### Delivered

- `src/core/validation/validator.ts` with `getFieldDescriptors`, `validateField`, `validateTask`, and `validate` as named exports.
- `src/core/validation/types.ts` containing `FieldDescriptor` and `FieldConstraints` types.
- All functions are synchronous and stateless; AJV validators are cached.

#### Completion criteria

- `getFieldDescriptors("knownTaskType")` returns one `FieldDescriptor` per editable scalar field in that task's sub-schema.
- `getFieldDescriptors` does not include the task type discriminator field.
- `getFieldDescriptors("unknownType")` returns `[]`.
- `validateTask` with a valid task returns `[]`.
- `validateTask` with an invalid task returns at least one `ErrorItem`.
- `validateField("knownTaskType", "name", "")` with a `minLength` constraint on `"name"` in that type's sub-schema returns at least one `ErrorItem`.
- `validateField("knownTaskType", "name", "valid-value")` returns `[]`.
- `validateField("knownTaskType", "nonExistentField", "x")` returns `[]`.
- `validateField("unknownTaskType", "name", "")` returns `[]` (no sub-schema, fail-safe).
- All functions are importable in Vitest (Node.js) with no DOM — verified by running the test suite.
- The module has zero imports from `@openworkflowspec/sdk`, `@xyflow/react`, `react`, or any store module.

#### Dependencies

- FE-03 (`schemaRegistry` implemented)
- FE-04 (`errorNormalizer` implemented)
- FE-01 (library selected and field-level lookup strategy documented)

---

### FE-06 ✅ Done

**Add `updateTask` action to `DiagramEditorContext` and `DiagramEditorContextProvider`**

#### Source reference

- plan.md §"Modified components" — `DiagramEditorContext` and `DiagramEditorContextProvider` rows
- plan.md §"Key Decisions and Rationale" AD-03 — "A single new context action (`updateTask`) is sufficient"
- architecture.md §4.4 — `DiagramEditorContext` and `DiagramEditorContextProvider`
- architecture.md §8 AR-04 — "Verify the index-lookup and mutation pattern"

#### Implementation notes

1. Open `src/store/DiagramEditorContext.tsx` and add `updateTask(nodeId: string, updatedTask: Specification.Task): void` to the context interface type.
2. Open `src/store/DiagramEditorContextProvider.tsx` and implement `updateTask`:
   - Locate the task in `model.do` whose associated node ID matches `nodeId`. Verify the exact lookup pattern against the current implementation — AR-04 flags this as a risk; inspect how nodes are currently identified in `model.do` before coding (plan.md §"Risks and Assumptions" R-04).
   - Replace the matched entry with `updatedTask`.
   - Call `setState` (or the equivalent update mechanism) with the new `model` reference so React re-renders consumers.
3. No additional state is added to the context (architecture AD-03): no in-progress edit state, no per-field error state.
4. The action is callable by `TaskEditForm` as the single write path from edit UI to model.

#### Expected output

- `DiagramEditorContext.tsx` updated with `updateTask` in the context interface.
- `DiagramEditorContextProvider.tsx` implementing `updateTask` that replaces the correct task in the model and triggers a re-render.

#### Completion criteria

- TypeScript compiles without errors after the change.
- Calling `updateTask(nodeId, updatedTask)` with a valid `nodeId` replaces the corresponding task in `model.do` and the new value is visible to context consumers on the next render.
- No other context state or actions are modified.

#### Dependencies

- None beyond existing codebase familiarity. (Can begin in parallel with FE-01 through FE-05 once the interface contract is understood from the architecture doc.)

---

### FE-07 ✅ Done

**Build `TaskEditForm` — schema-driven generic form renderer with local edit state**

#### Source reference

- plan.md §"New components" — `TaskEditForm` row
- plan.md §"Interfaces and Integrations" — `TaskEditForm ↔ DiagramEditorContext` and `TaskEditForm ↔ ErrorSection`
- architecture.md §4.2 — `TaskEditForm` responsibilities and boundaries
- design.md HLD §3.1, §3.2 — field blur and Apply system flows
- design.md HLD §4 — component interactions
- design.md HLD §5.1, §5.2, §5.3 — data movement (field values, descriptors, errors)
- feature-spec.md §4 FR-02, FR-03, FR-04, FR-05, FR-06, FR-07, FR-08, FR-09, FR-10, FR-12

#### Implementation notes

1. Create `src/side-panel/TaskEditForm.tsx`.

**Initialisation (panel open):**

- Accept `node` and `isReadOnly` as props from `NodeDetailsView`. (`isReadOnly = false` is guaranteed by `NodeDetailsView`'s render gate — see FE-08 — but the prop may be typed for clarity.)
- Derive `taskType` from `node.data.task` at mount time. The task type is the key in `node.data.task` that is **not** in `TASK_BASE_KEYS` (from `src/core/taskDetails.ts`) and is not a scalar base field — i.e. the key whose value is the task-type-specific configuration object (e.g. `"call"`, `"run"`, `"set"`). This is the same discriminator the existing `getTaskDetails` function skips past; use `Object.keys(node.data.task).find(k => !TASK_BASE_KEYS.has(k))` as the starting point.
- Call `getFieldDescriptors(taskType)` on mount. Store the returned `FieldDescriptor[]` in local state.
- Initialise a local field-values map from `node.data.task` (snapshot at panel-open time). Store a second snapshot copy for use on Cancel.

**Rendering fields:**

- Render one generic editable control per `FieldDescriptor`. Do not hard-code any field names or control types (spec FR-12, NFR-08, AD-07):
  - `type === "string"` → `<input type="text" />`
  - `type === "number"` → `<input type="number" />`
  - `type === "boolean"` → toggle or `<input type="checkbox" />`
- Render the task type field (the derived `taskType` key) as non-editable text (spec FR-10, architecture AD-05).
- Render the `then` field as non-editable text. `then` describes flow control — which task runs next — and is determined by task order in the workflow, not by editing individual task fields. It is read-only in this PoC.
- Apply a red-border CSS class to any field whose name is present in the current error map (design.md HLD §5.3).

**Field blur (`onBlur`):**

- Call `validateField(taskType, fieldName, currentValue)` from the validation core. Pass the `taskType` derived at mount time as the first argument.
- If errors returned: add or replace the `ErrorItem[]` for that field name in the local error map.
- If no errors: remove the entry for that field from the local error map.
- Re-render `ErrorSection` with the updated flat array of all current `ErrorItem`s (design.md HLD §3.1, spec FR-03, FR-04, FR-05).

**Apply (`onApply`):**

- Call `validateTask(localFieldValues)` from the validation core.
- If errors: replace the entire error map with the returned `ErrorItem[]`; apply red-border class to all offending fields; do not call `updateTask` (spec FR-06, FR-07).
- If no errors: call `context.updateTask(nodeId, localFieldValues)`; clear error map and red-border classes (spec FR-08, design.md HLD §3.2).

**Cancel (`onCancel`):**

- Reset local field values to the snapshot taken at panel-open time.
- Clear all entries in the error map and all red-border classes (spec FR-09).

**Error display:**

- Render `<ErrorSection />` (from `src/side-panel/ErrorsSection.tsx`) fed by the flat array of all current `ErrorItem`s from the error map.
- No new error UI components are introduced (spec NFR-03).

**Apply / Cancel buttons (as implemented):**

- `TaskEditForm` exposes a `TaskEditFormHandle` ref with `handleApply` and `handleCancel` methods.
- `SidePanel` holds the ref and calls `ref.current.handleApply()` / `ref.current.handleCancel()` from the footer buttons. No prop callbacks are threaded through `NodeDetailsView`.

#### Expected output

- `src/side-panel/TaskEditForm.tsx` implementing all behaviour described above.
- The component has no static field declarations — field list and control types come entirely from `getFieldDescriptors`.
- Local state: field values map, snapshot map, error map, field descriptors.

#### Completion criteria

- Mounting the component with a known task type renders one editable control per scalar field in that type's sub-schema (excluding task type field).
- Mounting with an unknown task type renders zero editable controls without crashing.
- Blurring a field with an invalid value shows a red border on that field and adds an entry to `ErrorSection` within 200 ms.
- Blurring a field with a valid value clears any prior red border and removes the entry from `ErrorSection`.
- Clicking Apply with invalid values shows errors and does not call `updateTask`.
- Clicking Apply with valid values calls `updateTask` exactly once and clears error state.
- Clicking Cancel resets all fields to their snapshot values and clears all errors.
- No import of `@openworkflowspec/sdk`, `@xyflow/react`, or any store module other than the context hook.
- TypeScript compiles without errors.

#### Dependencies

- FE-05 (validation core `getFieldDescriptors`, `validateTask`, `validateField` implemented)
- FE-06 (`updateTask` action available in context)

---

### FE-08 ✅ Done

**Modify `NodeDetailsView` — branch on `isReadOnly` to mount `TaskEditForm` or static list**

#### Source reference

- plan.md §"Modified components" — `NodeDetailsView` row: "Branches on `isReadOnly`: mounts `TaskEditForm` (edit mode) or retains the existing static field list (read-only mode)."
- architecture.md §4.3 — `NodeDetailsView` responsibilities
- design.md HLD §2 — main user flow (read-only column vs. edit mode column)
- feature-spec.md §4 FR-01, FR-02, NFR-04, NFR-06

#### Implementation notes

1. Open `src/side-panel/NodeDetailsView.tsx`.
2. Add a branch on `isReadOnly`:
   - `isReadOnly = true` → render the existing static field list and `ErrorSection` unchanged (spec NFR-06, FR-01). `TaskEditForm` is not mounted; the validation core is not imported into the active component tree for read-only users (spec NFR-04).
   - `isReadOnly = false` → render `<TaskEditForm node={node} />` in place of the static field list. The `YamlField` block continues to render in both modes.
3. The read-only branch must remain identical to its pre-PoC state. Do not restructure or refactor the read-only rendering path (spec NFR-06).
4. Add `onApply?: () => void` and `onCancel?: () => void` to `NodeDetailsViewProps` and forward them to `<TaskEditForm />`. The wiring contract is defined in FE-07 "Apply / Cancel buttons" — follow it exactly.

#### Expected output

- `src/side-panel/NodeDetailsView.tsx` with an `isReadOnly` branch that conditionally mounts `TaskEditForm`.
- The read-only rendering path is byte-for-byte unchanged in behaviour.

#### Completion criteria

- When `isReadOnly = true`, the component renders the existing static field list; `TaskEditForm` is not in the React tree.
- When `isReadOnly = false`, the component renders `TaskEditForm`; the static field list is not in the React tree.
- `YamlField` renders in both modes.
- TypeScript compiles without errors.

#### Dependencies

- FE-07 (`TaskEditForm` component exists)

---

### FE-09 ✅ Done

**Modify `SidePanel` — render Apply / Cancel in `SidebarFooter` conditionally**

#### Source reference

- plan.md §"Modified components" — `SidePanel` row: "Renders `SidebarFooter` conditionally: Apply + Cancel when a node is selected and `isReadOnly = false`; `MermaidActions` when no node is selected and `isReadOnly = false`; nothing in read-only mode."
- architecture.md §7 AD-06 — "Apply / Cancel buttons are rendered in `SidebarFooter`"
- design.md HLD §4 — `SidebarFooter` interaction diagram
- feature-spec.md §4 FR-02, NFR-07, AC-02
- feature-spec.md §3 out-of-scope — "Introduction of any new shadcn/ui components beyond the existing `SidebarFooter` primitive"

#### Implementation notes

1. Open `src/side-panel/SidePanel.tsx`.
2. The `SidebarFooter` slot already exists (used by `MermaidActions`). Extend the conditional logic:
   - Node selected **and** `isReadOnly = false` → render Apply and Cancel buttons inside `SidebarFooter`. Wire their click handlers to `onApply` and `onCancel` on `TaskEditForm`.
   - No node selected **and** `isReadOnly = false` → render `MermaidActions` inside `SidebarFooter` (existing behaviour, unchanged).
   - `isReadOnly = true` → render nothing in `SidebarFooter` (existing behaviour for read-only mode, unchanged).
3. No new shadcn/ui component is introduced. Apply and Cancel are plain buttons or use an existing button primitive already in the project.
4. The buttons must be rendered inside `SidebarFooter` so they are sticky-pinned and visible without scrolling regardless of how many fields `TaskEditForm` renders (spec NFR-07, AC-02).
5. The `onApply` and `onCancel` handlers are created in `SidePanel` and passed down through `NodeDetailsView` to `TaskEditForm`. The callback contract is defined in FE-07 "Apply / Cancel buttons" — follow it exactly.

#### Expected output

- `src/side-panel/SidePanel.tsx` updated with the three-way `SidebarFooter` conditional.
- Apply and Cancel buttons visible in the sticky footer when a node is selected in edit mode.
- `MermaidActions` continues to appear when no node is selected and `isReadOnly = false`.
- Footer is empty in read-only mode.

#### Completion criteria

- With a node selected and `isReadOnly = false`: Apply and Cancel buttons are rendered in `SidebarFooter`; they are visible without scrolling regardless of field count.
- With no node selected and `isReadOnly = false`: `MermaidActions` renders in `SidebarFooter` (pre-existing behaviour preserved).
- With `isReadOnly = true`: `SidebarFooter` renders nothing.
- No new shadcn/ui component is added.
- TypeScript compiles without errors.

#### Dependencies

- FE-07 (`TaskEditForm` exposes `onApply` and `onCancel` callback props)
- FE-08 (`NodeDetailsView` wiring is in place)
