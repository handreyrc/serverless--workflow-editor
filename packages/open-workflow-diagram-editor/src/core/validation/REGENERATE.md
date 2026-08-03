# Regenerating / Updating Validation Schemas

## Overview

The validation core in `src/core/validation/` validates task fields and whole
workflows against the
[Open Workflow Specification JSON Schema](https://github.com/open-workflow-specification/sdk-typescript/tree/main/src/lib/generated/schema).

The schema file is stored locally under:

```
src/core/validation/schema/workflow.json
```

This is a **verbatim copy** of the upstream file. No transformation is applied.

The public API is exposed by `validator.ts`:

| Function                                | What it validates                                              |
| --------------------------------------- | -------------------------------------------------------------- |
| `getFieldDescriptors(taskType)`         | Returns editable scalar field metadata for a task type         |
| `validateTask(taskType, task)`          | Validates a single task object against its task sub-schema     |
| `validateField(taskType, field, value)` | Validates a single scalar field value                          |
| `validate(workflow)`                    | Validates the complete workflow object against the root schema |

All functions return `ErrorItem[]` (`{ field: string; message: string }[]`) and never throw.

---

## When to update

- A new version of the Open Workflow Specification SDK is released.
- A new task type is added to the spec.
- A scalar field gains, loses, or changes constraints (e.g. a new `minLength`).
- A top-level workflow property is added, removed, or made required.
- The schema `$id` or `$schema` version changes.

---

## How to update

### 1. Replace the schema file

```bash
curl -o packages/open-workflow-diagram-editor/src/core/validation/schema/workflow.json \
  https://raw.githubusercontent.com/open-workflow-specification/sdk-typescript/main/src/lib/generated/schema/workflow.json
```

### 2. Register any new task types

If a new task type was added to `$defs` (e.g. `newThingTask`) add its
discriminator key to `TASK_TYPE_TO_DEF` in `schemaRegistry.ts`:

```ts
// schemaRegistry.ts — TASK_TYPE_TO_DEF
newThing: "newThingTask",
```

Also add the discriminator key to the `TASK_TYPE_KEYS` set in `validator.ts`
so it is excluded from editable field descriptors:

```ts
// validator.ts — TASK_TYPE_KEYS
const TASK_TYPE_KEYS = new Set([
  ..., "newThing",
]);
```

`TaskEditForm` will automatically render the new task's scalar fields once
both entries are added — no further code changes are needed.

### 3. Verify workflow-level validation

`validate` in `validator.ts` compiles a validator directly from the
root `workflow.json` schema (exported as `rootWorkflowSchema` from
`schemaRegistry.ts`). Because it uses the full schema verbatim, any changes
to required top-level fields (e.g. `document`, `do`) or `$defs` are picked up
automatically — **no code change is needed** for `validate` when the
schema changes.

### 4. Run the test suite

```bash
pnpm --filter open-workflow-diagram-editor exec vitest run tests/core/validation/
```

All existing tests must pass. Add new tests for any new task types or changed
field constraints.

---

## Schema structure notes

The `workflow.json` schema follows JSON Schema 2020-12 (`$schema: https://json-schema.org/draft/2020-12/schema`).

**Root schema** — describes the complete workflow object. Required top-level
properties are `document` and `do`. The root schema is re-exported from
`schemaRegistry.ts` as `rootWorkflowSchema` and is used by `validate`.

**Task sub-schemas** — live in `$defs` (e.g. `setTask`, `waitTask`, `forTask`).
Each task sub-schema uses `allOf` to merge `taskBase` (common inherited fields)
with task-specific properties.

The **only editable scalar field from `taskBase`** is currently `if` (a runtime
expression string). All other `taskBase` fields (`input`, `output`, `export`,
`timeout`, `then`, `metadata`) are complex objects excluded from the edit form
by design.

Task-type-specific scalar fields (like `for.each`, `for.in`, `for.at`, `for.while`)
are **nested inside object properties** and are therefore out of scope for this PoC
(which targets top-level scalar fields only). They will become editable when nested
object editing is implemented.
