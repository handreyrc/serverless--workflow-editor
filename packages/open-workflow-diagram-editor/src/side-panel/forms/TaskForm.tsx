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
import { useForm, FormProvider } from "react-hook-form";
import type { Specification } from "@openworkflowspec/sdk";
import { useI18n } from "@openworkflowspec/i18n";
import { getFormFieldsForNodeType } from "@/core/schemaWalker";
import { FormField } from "./FormField";
import { useSiblingTaskNames } from "./useSiblingTaskNames";
import { useDiagramEditorContext } from "@/store/DiagramEditorContext";
import { TaskFormContext, filterReadOnlyFields } from "./taskFormContext";
export type { TaskFormContextType } from "./taskFormContext";
export { useTaskFormContext } from "./taskFormContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flattens a task object into a dot-notation record suitable for
 * react-hook-form `defaultValues`. Arrays are kept as-is (they are rendered
 * as child-task-list fields, which are always read-only).
 */
function flattenTask(value: unknown, prefix = ""): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value)) {
    return prefix ? { [prefix]: value } : {};
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    let result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) {
        result[fullKey] = v;
      } else if (typeof v === "object" && v !== null) {
        result = { ...result, ...flattenTask(v, fullKey) };
      } else {
        result[fullKey] = v;
      }
    }
    return result;
  }
  return prefix ? { [prefix]: value } : {};
}

// ---------------------------------------------------------------------------
// TaskForm
// ---------------------------------------------------------------------------

export type TaskFormProps = {
  nodeType: string;
  task: Specification.Task;
  /**
   * The non-indexed structural node id (e.g. `/do/logReading/do/callOrderService`).
   * Used as the form reset-identity key and to locate sibling tasks in the model.
   */
  nodeId?: string | undefined;
  /**
   * Called on mount (and whenever the task changes) with the form's internal
   * reset function, so that the Cancel button rendered outside this component
   * can trigger a reset without lifting state.
   */
  onRegisterCancel?: ((reset: () => void) => void) | undefined;
};

export function TaskForm({ nodeType, task, nodeId, onRegisterCancel }: TaskFormProps) {
  const { t } = useI18n();
  const { isReadOnly, model } = useDiagramEditorContext();
  const siblingTaskNames = useSiblingTaskNames(model, nodeId);

  // ── Resolve form fields from schema ───────────────────────────────────────
  const allFields = React.useMemo(() => getFormFieldsForNodeType(nodeType), [nodeType]);

  // ── Default values (flattened task) ──────────────────────────────────────
  const defaultValues = React.useMemo(
    () => flattenTask(task as unknown),
    // We intentionally use nodeId as the reset signal, not task object identity,
    // so the form resets when the selected task changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeId],
  );

  // ── react-hook-form ───────────────────────────────────────────────────────
  const methods = useForm<Record<string, unknown>>({
    defaultValues,
    // Validation will be wired here in a subsequent task (AJV resolver).
  });

  const { reset } = methods;

  // Reset form whenever the selected task changes
  React.useEffect(() => {
    reset(flattenTask(task as unknown));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, reset]);

  // ── Read-only: filter fields ──────────────────────────────────────────────
  const visibleFields = React.useMemo(() => {
    if (!isReadOnly) return allFields;
    return filterReadOnlyFields(allFields, task as Record<string, unknown>);
  }, [allFields, isReadOnly, task]);

  // Register the reset function with the parent (SidePanel) whenever the task changes.
  React.useEffect(() => {
    onRegisterCancel?.(() => reset(flattenTask(task as unknown)));
  }, [onRegisterCancel, reset, task]);

  if (allFields.length === 0 || visibleFields.length === 0) return null;

  return (
    <TaskFormContext.Provider
      value={{ isReadOnly, siblingTaskNames, taskData: task as Record<string, unknown> }}
    >
      <FormProvider {...methods}>
        <form
          className="dec-task-form"
          onSubmit={(e) => e.preventDefault()}
          aria-label={t("aria.form.taskProperties")}
        >
          <div className="dec-task-form-fields">
            {visibleFields.map((field) => (
              <FormField key={field.path} field={field} />
            ))}
          </div>
        </form>
      </FormProvider>
    </TaskFormContext.Provider>
  );
}
