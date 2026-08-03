/*
 * Copyright 2021-Present The Open Workflow Specification Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as React from "react";
import type * as RF from "@xyflow/react";
import { useI18n } from "@openworkflowspec/i18n";
import { useDiagramEditorContext } from "@/store/DiagramEditorContext";
import { validateTask, validateField } from "@/core/validation/validator";
import type { ErrorItem } from "@/core/validation/errorNormalizer";
import type { BaseNodeData } from "@/react-flow/nodes/Nodes";
import { getTaskDetails, type DetailField } from "@/core/taskDetails";
import { PropertyField, SectionHeader } from "./Fields";

/**
 * Task-type discriminator keys — always read-only (the type itself is not editable).
 */
const TASK_TYPE_KEYS = new Set([
  "call",
  "do",
  "emit",
  "for",
  "fork",
  "listen",
  "raise",
  "run",
  "set",
  "switch",
  "try",
  "wait",
]);

/** Derives the OWF task type key from a task object. */
function resolveTaskType(task: Record<string, unknown>): string | undefined {
  return Object.keys(task).find((k) => TASK_TYPE_KEYS.has(k));
}

/** Returns the display text for a non-editable DetailField, matching the read-only view. */
function fieldText(field: DetailField): string {
  switch (field.kind) {
    case "array":
      return `${field.count} item${field.count === 1 ? "" : "s"}`;
    case "text":
      return field.display;
    case "object":
      return "{...}";
  }
}

/**
 * Returns true when a DetailField row can be rendered as an editable input.
 * Criteria:
 *   - kind: "text" (scalar leaf — already flattened by getTaskDetails)
 *   - path is not a task-type discriminator key (call, set, for, …)
 *
 * Dotted paths (e.g. "with.operationId", "with.document.endpoint") ARE editable —
 * getTaskDetails has already resolved them to scalar string leaves.
 */
function isEditableField(field: DetailField): boolean {
  return field.kind === "text" && !TASK_TYPE_KEYS.has(field.path);
}

/**
 * Reads the value at a dot-notation path from a nested object.
 * e.g. getByPath({ with: { operationId: "x" } }, "with.operationId") → "x"
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Returns a deep clone of `base` with each dot-notation path in `edits` written in.
 * Only paths already present in `base` are updated; no new top-level keys are added.
 * e.g. deepSet({ with: { operationId: "old" } }, { "with.operationId": "new" })
 *      → { with: { operationId: "new" } }
 */
function deepSet(
  base: Record<string, unknown>,
  edits: Record<string, string | number | boolean>,
): Record<string, unknown> {
  // Deep-clone so we never mutate the live task object
  const result = structuredClone(base) as Record<string, unknown>;
  for (const [path, value] of Object.entries(edits)) {
    const parts = path.split(".");
    let cur: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (cur[part] === null || typeof cur[part] !== "object" || Array.isArray(cur[part])) break;
      cur = cur[part] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1]!;
    if (leaf in cur) {
      cur[leaf] = value;
    }
  }
  return result;
}

export type TaskEditFormProps = {
  node: RF.Node<BaseNodeData>;
};

type FieldValues = Record<string, string | number | boolean>;
type ErrorMap = Record<string, ErrorItem[]>;

/**
 * Imperative handle so SidePanel can trigger apply/cancel from SidebarFooter buttons.
 */
export type TaskEditFormHandle = {
  handleApply: () => void;
  handleCancel: () => void;
};

/**
 * TaskEditForm — edit-mode side-panel form.
 *
 * Renders the same field rows as the read-only view (via getTaskDetails), using
 * PropertyField for read-only rows and an <input> for editable scalar fields:
 *   - Top-level scalar fields (string / number / boolean), not a type-key → editable input
 *   - Dotted-path (nested) scalars  → read-only PropertyField (matching static view)
 *   - Array / object fields          → read-only PropertyField (matching static view)
 *   - Task-type discriminator key    → read-only PropertyField (type is not editable)
 *
 * Always reads from model.do via context.getTask, falling back to node.data.task for
 * nested tasks (e.g. inside for.do) that getTask cannot yet reach in the top-level walk.
 */
export const TaskEditForm = React.forwardRef<TaskEditFormHandle, TaskEditFormProps>(
  function TaskEditForm({ node }, ref) {
    const { t } = useI18n();
    const { getTask, updateTask } = useDiagramEditorContext();

    // Fetch the live task: prefer model.do (canonical source after edits) but fall back
    // to node.data.task for nested tasks that getTask can't yet reach via the top-level
    // model.do walk (e.g. tasks inside for.do, try.do, fork branches, etc.).
    // node.data.task is set directly from the SDK flat-graph node and is always correct.
    const liveTask = getTask(node.id) ?? node.data.task;
    const taskRecord = liveTask ? (liveTask as Record<string, unknown>) : {};
    const taskType = resolveTaskType(taskRecord);

    // Derive the same field list as the read-only view — order and rows are identical.
    const fields: DetailField[] = liveTask ? getTaskDetails(liveTask) : [];

    /**
     * Builds initial editable values from the DetailField list.
     * Keys are dot-notation paths (e.g. "with.operationId"); values are the resolved scalars.
     * Only text fields that are not task-type keys are included.
     */
    const buildInitialValues = React.useCallback((fieldList: DetailField[]): FieldValues => {
      const vals: FieldValues = {};
      for (const field of fieldList) {
        if (!isEditableField(field)) continue;
        // field.kind === "text" is guaranteed by isEditableField
        vals[field.path] = (field as { path: string; kind: "text"; display: string }).display;
      }
      return vals;
    }, []);

    const [fieldValues, setFieldValues] = React.useState<FieldValues>(() =>
      buildInitialValues(fields),
    );
    const snapshotRef = React.useRef<FieldValues>(buildInitialValues(fields));
    const [errorMap, setErrorMap] = React.useState<ErrorMap>({});
    const [hoveredField, setHoveredField] = React.useState<string | null>(null);

    // Re-initialise when the user clicks a different task node
    const prevNodeIdRef = React.useRef(node.id);
    React.useEffect(() => {
      if (prevNodeIdRef.current === node.id) return;
      prevNodeIdRef.current = node.id;
      const freshTask = getTask(node.id) ?? node.data.task;
      const freshFields = freshTask ? getTaskDetails(freshTask) : [];
      const fresh = buildInitialValues(freshFields);
      setFieldValues(fresh);
      snapshotRef.current = fresh;
      setErrorMap({});
      setHoveredField(null);
    }, [node.id, node.data.task, getTask, buildInitialValues]);

    // Field change handler — coerces string input back to the original type
    function handleChange(name: string, rawValue: string, originalValue: unknown) {
      let coerced: string | number | boolean = rawValue;
      if (typeof originalValue === "number") {
        const n = Number(rawValue);
        coerced = isNaN(n) ? rawValue : n;
      } else if (typeof originalValue === "boolean") {
        coerced = rawValue === "true";
      }
      setFieldValues((prev) => ({ ...prev, [name]: coerced }));
    }

    // Per-field blur validation — value is passed explicitly to avoid reading stale fieldValues state.
    function handleBlur(name: string, value: unknown) {
      if (!taskType) return;
      const errors = validateField(taskType, name, value, taskRecord);
      setErrorMap((prev) => {
        const next = { ...prev };
        if (errors.length > 0) {
          next[name] = errors;
        } else {
          delete next[name];
        }
        return next;
      });
    }

    // Apply: write edited values back into the task object at their dot-paths, then validate
    function handleApply() {
      if (!taskType || !liveTask) return;
      const mergedTask = deepSet(liveTask as Record<string, unknown>, fieldValues);
      const errors = validateTask(taskType, mergedTask);
      if (errors.length > 0) {
        const newErrorMap: ErrorMap = {};
        for (const err of errors) {
          const field = err.field ?? "unknown";
          if (!newErrorMap[field]) newErrorMap[field] = [];
          newErrorMap[field]!.push(err);
        }
        setErrorMap(newErrorMap);
        return;
      }
      // TODO: When undo/redo is implemented, wrap updateTask in the undo/redo stack.
      // TODO: When the diagram is live-linked to the model (Milestone 2), trigger a
      //       diagram refresh so the node reflects the committed change.
      updateTask(node.id, mergedTask as never);
      setErrorMap({});
      snapshotRef.current = { ...fieldValues };
    }

    // Cancel: restore snapshot (FR-09)
    function handleCancel() {
      setFieldValues({ ...snapshotRef.current });
      setErrorMap({});
      setHoveredField(null);
    }

    React.useImperativeHandle(ref, () => ({ handleApply, handleCancel }));

    if (!taskType || fields.length === 0) {
      return <p className="dec-sidebar-hint-text">{t("sidebar.noDetails")}</p>;
    }

    return (
      <div data-testid="task-edit-form">
        <SectionHeader label={t("sidebar.sectionProperties")} />
        <dl>
          {fields.map((field) => {
            const editable = isEditableField(field);
            const hasError = !!errorMap[field.path]?.length;

            if (!editable) {
              // Read-only row — identical to the static view
              return <PropertyField key={field.path} label={field.path} value={fieldText(field)} />;
            }

            // Editable scalar input — the original value drives the input type.
            // Use getByPath for dotted paths (e.g. "with.operationId") since
            // taskRecord[field.path] only resolves top-level keys.
            const originalValue = getByPath(taskRecord, field.path);
            // field.kind === "text" is guaranteed by isEditableField
            const displayValue = (field as { path: string; kind: "text"; display: string }).display;
            const currentValue = fieldValues[field.path] ?? displayValue;
            const inputType =
              typeof originalValue === "number"
                ? "number"
                : typeof originalValue === "boolean"
                  ? "checkbox"
                  : "text";

            const showTooltip = hasError && hoveredField === field.path;

            return (
              <div
                key={field.path}
                className="dec-sidebar-prop dec-edit-field-wrap"
                data-testid={`task-edit-field-${field.path}`}
                onMouseEnter={() => hasError && setHoveredField(field.path)}
                onMouseLeave={() => setHoveredField(null)}
              >
                <label
                  className="dec-sidebar-prop-label dec-edit-field-label"
                  htmlFor={`task-edit-input-${node.id}-${field.path}`}
                >
                  {field.path}
                </label>
                {inputType === "checkbox" ? (
                  <div className="dec-edit-checkbox-wrap">
                    <input
                      id={`task-edit-input-${node.id}-${field.path}`}
                      type="checkbox"
                      className={`dec-edit-checkbox${hasError ? " dec-edit-input--error" : ""}`}
                      checked={currentValue === true || currentValue === "true"}
                      onChange={(e) =>
                        handleChange(field.path, String(e.target.checked), originalValue)
                      }
                      onBlur={(e) => {
                        handleBlur(field.path, e.target.checked);
                        setHoveredField(null);
                      }}
                      data-testid={`task-edit-input-${field.path}`}
                      aria-invalid={hasError}
                    />
                  </div>
                ) : (
                  <input
                    id={`task-edit-input-${node.id}-${field.path}`}
                    type={inputType}
                    className={`dec-edit-input${hasError ? " dec-edit-input--error" : ""}`}
                    value={
                      currentValue !== undefined && currentValue !== null
                        ? String(currentValue)
                        : ""
                    }
                    onChange={(e) => handleChange(field.path, e.target.value, originalValue)}
                    onBlur={(e) => {
                      handleBlur(
                        field.path,
                        inputType === "number"
                          ? e.target.value === ""
                            ? e.target.value
                            : Number(e.target.value)
                          : e.target.value,
                      );
                      setHoveredField(null);
                    }}
                    data-testid={`task-edit-input-${field.path}`}
                    aria-invalid={hasError}
                  />
                )}
                {showTooltip && (
                  <ul className="dec-edit-field-errors" role="tooltip" aria-live="polite">
                    {errorMap[field.path]!.map((err, i) => (
                      <li key={i} className="dec-edit-field-error-msg">
                        {err.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </dl>
      </div>
    );
  },
);
