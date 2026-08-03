# Feature Specification — Task Field Validation (Feasibility Spike / PoC)

> **Related issue:** [#284](https://github.com/open-workflow-specification/editor/issues/284)
> **Status:** Complete
> **Spike / PoC scope** — This was a feasibility investigation. All open questions are resolved and the PoC is implemented. See [VALIDATION_SPIKE.md](./VALIDATION_SPIKE.md) for the full outcome.

---

## 1. Goal and expected outcome

Determine whether the Open Workflow Specification JSON Schema (published at [`sdk-typescript/src/lib/generated/schema`](https://github.com/open-workflow-specification/sdk-typescript/tree/main/src/lib/generated/schema)) can be used directly to validate a single task, and a single field within a task, in isolation — without submitting the full workflow model.

**Outcome:** The spike is complete. The selected library is **AJV** (v8, JSON Schema 2020-12), which directly consumes the OWF JSON Schema sub-schemas and supports per-field constraint targeting at `$defs` granularity (Option A confirmed). The PoC delivers working field-level and task-level validation, a schema-driven dynamic form, and full-workflow validation — all implemented and tested.

**SDK ownership (long-term target):** The PoC validation logic is implemented on the editor side as a reference design. The correct production target is to move `validateField` and `validateTask` into the [OWF TypeScript SDK](https://github.com/open-workflow-specification/sdk-typescript), so the schema is owned exclusively by the SDK and the editor becomes a thin consumer. See [VALIDATION_SPIKE.md § Target state — validation API in the SDK](./VALIDATION_SPIKE.md) for the proposed SDK API shape.

Validation feedback is demonstrated at two granularities inside the side-panel editor:

- **Field-level:** errors surface when a field loses focus, with the offending field visually highlighted.
- **Task-level:** errors surface when the user applies changes, with all offending fields highlighted.
- **Workflow-level:** errors surface automatically after a successful Apply, through the existing Errors panel.

---

## 2. Target users and scenarios

**Persona:** Diagram editor user

| #   | Scenario                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | User opens the editor in **edit mode** (`readOnly = false`), selects a task, and edits field values in the side-panel.                                           |
| 2   | User edits a field to an invalid value and moves focus away; they expect to see which field is wrong and why before clicking Apply.                              |
| 3   | User clicks **Apply** with one or more invalid field values and expects to see all errors before the change is committed.                                        |
| 4   | User clicks **Cancel** and expects all in-progress edits to be discarded with no errors shown.                                                                   |
| 5   | User opens the editor in **read-only mode** (`readOnly = true`), selects a task, and expects to see field values displayed but not editable; no validation runs. |

---

## 3. Scope

### In scope

- Isolated validation of a single task object against the Open Workflow Specification schema (without the surrounding workflow).
- Isolated validation of a single field value within a task against the same schema.
- Display of field-level validation errors on focus loss using the existing `ErrorSection` banner and red-border field highlight.
- Display of full-task validation errors on Apply using the same mechanisms.
- Apply and Cancel buttons added to the side-panel, visible only when `readOnly = false`, pinned in a sticky footer using the existing `SidebarFooter` primitive so they remain visible regardless of the number of fields.
- Discard of all in-progress edits on Cancel.
- Enforcement of `readOnly` state: no editing, no Apply / Cancel buttons, and no validation triggered when `isReadOnly = true`.
- Task type field is **not** editable regardless of edit mode.
- A decoupled validation API (not embedded in diagram rendering logic) that can be consumed from dynamic forms and evaluated for upstreaming into the SDK.
- Schema-driven dynamic form rendering: the list of editable fields and their control types are derived at runtime from the JSON Schema, not declared statically in `TaskEditForm`. No editor code change is required when the schema adds, removes, or modifies fields or task types.

### Out of scope

- Editing compound / nested task fields (objects, arrays) in this iteration.
- Changes to the YAML source view or Mermaid export triggered by in-progress edits.
- Persistence or undo/redo of edits beyond the Apply / Cancel cycle.
- Multi-task or workflow-level validation triggered from the side-panel.
- Any UI for adding or removing task fields.
- Production-readiness hardening (performance optimisation, full accessibility audit, i18n of new labels).
- Introduction of any new shadcn/ui components beyond the existing `SidebarFooter` primitive already present in the project.

---

## 4. Functional requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | When the editor is in read-only mode, task fields are displayed as non-editable values; no edit controls, Apply button, or Cancel button are rendered, and no validation is triggered.                                                                                                                                                                                            |
| FR-02 | When the editor is in edit mode, task fields (excluding task type) are rendered as editable controls, and Apply and Cancel buttons are rendered in a sticky footer at the bottom of the side-panel using `SidebarFooter`, so they remain visible regardless of how many fields are displayed.                                                                                     |
| FR-03 | When an editable field loses focus, the validation core validates that field value in isolation against the schema and returns any errors.                                                                                                                                                                                                                                        |
| FR-04 | If FR-03 produces errors, the field is visually marked with a red border and the errors are appended to the side-panel error banner (`ErrorSection`).                                                                                                                                                                                                                             |
| FR-05 | If FR-03 produces no errors, any prior red border and error entries for that field are cleared from the banner.                                                                                                                                                                                                                                                                   |
| FR-06 | When the user clicks **Apply**, the validation core validates the complete edited task against the schema and returns any errors.                                                                                                                                                                                                                                                 |
| FR-07 | If FR-06 produces errors, all offending fields are marked with red borders and the errors are displayed in the side-panel error banner; the change is not committed to the model.                                                                                                                                                                                                 |
| FR-08 | If FR-06 produces no errors, the edited task is committed to the workflow model and error state is cleared.                                                                                                                                                                                                                                                                       |
| FR-09 | When the user clicks **Cancel**, all in-progress field edits are discarded, red borders are removed, and the error banner is cleared.                                                                                                                                                                                                                                             |
| FR-10 | The task type field is always non-editable, regardless of edit mode.                                                                                                                                                                                                                                                                                                              |
| FR-11 | The validation logic is exposed as a standalone, callable API that is independent of diagram rendering and can be consumed by dynamic form components. For the purposes of this PoC, the API exposes at minimum `validateTask(task)` and `validateField(fieldName, value)` as named exports (names are illustrative and may be adjusted during implementation).                   |
| FR-12 | The list of editable fields rendered for a task, and the input control type used for each field (text, number, boolean toggle), are derived at runtime from the JSON Schema for that task type. `TaskEditForm` does not contain a static list of field names or control types; it receives field descriptors from the validation core and renders controls generically from them. |

---

## 5. Non-functional requirements

| ID     | Requirement                    | Measurable threshold                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Field-level validation latency | Error feedback appears within **200 ms** of focus loss under normal browser conditions.                                                                                                                                                                                                                                                                                                                                                                                                        |
| NFR-02 | Full-task validation latency   | Apply-time validation completes and feedback appears within **500 ms** of the button click under normal browser conditions.                                                                                                                                                                                                                                                                                                                                                                    |
| NFR-03 | Error display                  | All errors use the existing `ErrorSection` component and `ErrorItem` data structure (`field: string`, `message: string`) — no new error rendering components are introduced. Errors from the chosen validation library are normalised to `ErrorItem` before display; the type is not extended.                                                                                                                                                                                                 |
| NFR-04 | Edit-mode gate                 | Zero validation calls are made and zero edit controls are rendered when `isReadOnly = true`. This is verified by test.                                                                                                                                                                                                                                                                                                                                                                         |
| NFR-05 | Validation API decoupling      | The validation core has no direct import of `@openworkflowspec/sdk`, React-Flow, diagram store, or rendering modules; it is importable in a non-browser (Node.js test) environment.                                                                                                                                                                                                                                                                                                            |
| NFR-06 | Backward compatibility         | Existing read-only side-panel behaviour (field display, error banner, YAML source block) is unchanged and all existing tests continue to pass.                                                                                                                                                                                                                                                                                                                                                 |
| NFR-07 | Action button visibility       | The Apply and Cancel buttons are always visible within the side-panel viewport when the editor is in edit mode, regardless of the number of task fields displayed above them.                                                                                                                                                                                                                                                                                                                  |
| NFR-08 | Schema version agnosticism     | Adding a new task type or adding, removing, or changing scalar field constraints in the schema files requires no change to any editor component (including `TaskEditForm`, `NodeDetailsView`, and the validation core logic). Only the schema files in `src/core/validation/schema/` are updated. This is verified by the PoC demonstrating that a task type not present at initial implementation time renders and validates correctly after its sub-schema is added to the schema directory. |

---

## 6. Acceptance criteria

### AC-01 — Read-only mode: no editable controls or action buttons (FR-01)

```
Given  the editor is in read-only mode
And    a task node is selected
When   the side-panel opens
Then   each task field value is displayed as static text
And    no input, textarea, or select control is rendered for any field
And    the task type field is displayed as static text
And    no Apply or Cancel button is rendered
```

### AC-02 — Edit mode: editable fields and action buttons rendered (FR-02, FR-10, NFR-07)

```
Given  the editor is in edit mode
And    a task node is selected
When   the side-panel opens
Then   each task field except task type is rendered as an editable control
And    the task type field is displayed as non-editable text
And    an Apply button and a Cancel button are rendered in the sticky sidebar footer
And    the Apply and Cancel buttons are visible without scrolling regardless of how many fields are displayed
```

### AC-10 — Schema-driven rendering: new task type renders without code change (FR-12, NFR-08)

```
Given  a task type whose sub-schema is present in src/core/validation/schema/
And    no corresponding static field list exists in TaskEditForm
When   the user selects a node of that task type in edit mode
Then   the side-panel renders an editable control for each scalar field declared in that sub-schema
And    no code change to TaskEditForm or NodeDetailsView was required
```

### AC-11 — Schema-driven rendering: control type matches schema type (FR-12)

```
Given  a task field whose JSON Schema type is "string"
Then   it is rendered as a text input
Given  a task field whose JSON Schema type is "number" or "integer"
Then   it is rendered as a number input
Given  a task field whose JSON Schema type is "boolean"
Then   it is rendered as a toggle or checkbox control
```

### AC-03 — Field validation on blur: valid value (FR-03, FR-05)

```
Given  the editor is in edit mode
And    the side-panel shows an editable field that previously had a validation error
When   the user edits the field to a valid value
And    the field loses focus
Then   the red border is removed from that field
And    the error entry for that field is removed from the error banner
```

### AC-04 — Field validation on blur: invalid value (FR-03, FR-04)

```
Given  the editor is in edit mode
And    an editable field contains an invalid value
When   the field loses focus
Then   a red border is applied to that field within 200 ms under normal browser conditions
And    one or more error messages for that field appear in the side-panel error banner within 200 ms under normal browser conditions
And    the error banner shows the field name alongside each error message
```

### AC-05 — Apply with errors: change not committed (FR-06, FR-07)

```
Given  the editor is in edit mode
And    one or more task fields contain invalid values
When   the user clicks Apply
Then   each offending field is marked with a red border within 500 ms under normal browser conditions
And    all error messages appear in the side-panel error banner within 500 ms under normal browser conditions
And    the workflow model is not updated
```

### AC-06 — Apply with no errors: change committed (FR-06, FR-08)

```
Given  the editor is in edit mode
And    all task field values are valid
When   the user clicks Apply
Then   the edited task is committed to the workflow model
And    no red borders are shown
And    the error banner is empty
```

### AC-07 — Cancel discards edits (FR-09)

```
Given  the editor is in edit mode
And    the user has changed one or more field values
When   the user clicks Cancel
Then   all field values revert to their state when the side-panel was opened
And    all red borders are removed
And    the error banner is cleared
```

### AC-08 — Validation API is decoupled (FR-11, NFR-05)

```
Given  the editor-side validation module (no @openworkflowspec/sdk import at runtime)
When   it is imported in a Node.js test environment (no DOM)
Then   it executes without error
And    calling validateTask with a valid task object returns an empty error array
And    calling validateField with an invalid field value returns one or more ErrorItem objects
```

### AC-09 — Read-only mode: no validation triggered (FR-01, NFR-04)

```
Given  the editor is in read-only mode
And    a task node is selected
When   the side-panel is displayed
Then   no call to the validation API is made
And    no edit controls are rendered
```

---

## 7. Assumptions and open questions

| #     | Type      | Statement                                                                                                                                                                                                                                                                                                                   | Status                                                                                    |
| ----- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A-01  | Confirmed | The Open Workflow Specification publishes a machine-readable JSON Schema at [`sdk-typescript/src/lib/generated/schema`](https://github.com/open-workflow-specification/sdk-typescript/tree/main/src/lib/generated/schema). It can be consumed independently of the SDK.                                                     | ✅ Confirmed                                                                              |
| A-02  | Confirmed | The JSON Schema exposes per-task-type sub-schemas (`$defs` entries such as `setTask`, `waitTask`, `callTask`) that allow field-level constraints (`type`, `required`, `enum`, `minLength`, etc.) to be targeted in isolation via AJV compiled on a sub-schema with `$defs` embedded. Full workflow context is not required. | ✅ Confirmed — implemented in `validateField` and `getFieldDescriptors` in `validator.ts` |
| A-03  | Confirmed | AJV error output is normalised to `ErrorItem` (`field: string`, `message: string`) via `errorNormalizer.ts` without any change to `ErrorSection`. AJV keywords (`minLength`, `type`, `pattern`, etc.) are translated to plain-English sentences.                                                                            | ✅ Confirmed — implemented in `errorNormalizer.ts`                                        |
| A-04  | Confirmed | The PoC targets only scalar task fields (strings, numbers, booleans). Complex fields (arrays, nested objects) are deferred.                                                                                                                                                                                                 | ✅ Confirmed — implemented as scoped                                                      |
| OQ-01 | Resolved  | AJV (v8, JSON Schema 2020-12) directly consumes the OWF JSON Schema and supports per-field and per-task-type sub-schema targeting. Option A is confirmed. No derived Zod schema was needed.                                                                                                                                 | ✅ Resolved — Option A (AJV) selected                                                     |
| OQ-02 | Resolved  | Apply and Cancel buttons are rendered in `SidebarFooter`. `SidePanel` uses an imperative ref (`TaskEditFormHandle`) to trigger `handleApply` / `handleCancel` on `TaskEditForm`.                                                                                                                                            | ✅ Resolved                                                                               |
| OQ-03 | Resolved  | AJV error normalisation to `ErrorItem` is straightforward for all scalar keywords. Nested path errors use `instancePath` stripping of numeric array indices to produce node-level paths for workflow validation. No edge cases blocked the PoC scope.                                                                       | ✅ Resolved — implemented in `errorNormalizer.ts`                                         |
| OQ-04 | Resolved  | The OWF JSON Schema has sparse `title` annotation coverage. A camelCase-to-words transform is applied as the fallback (`camelToLabel` in `validator.ts`), producing human-readable labels (e.g. `retryLimit` → "Retry Limit").                                                                                              | ✅ Resolved — `camelToLabel` in `validator.ts`                                            |
| OQ-05 | Resolved  | Fields are treated uniformly in the PoC for simplicity — no asterisk or visual required/optional distinction. The `required` flag is carried in `FieldDescriptor` for future use.                                                                                                                                           | ✅ Resolved — deferred to a future iteration                                              |
