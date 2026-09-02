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
import { getFormFieldsForNodeType, structuralEqual } from "@/core";
import { FormField } from "./FormField";
import { useSiblingTaskNames } from "./useSiblingTaskNames";
import { useDiagramEditorContext } from "@/store/DiagramEditorContext";
import { TaskFormContext, filterReadOnlyFields } from "./taskFormContext";
import { buildTaskFormResolver, useWorkflowErrorsForForm } from "./validation";
import { buildFormErrors } from "./customErrors";
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
   * The RFC 6901-style indexed task reference (e.g. `/do/0/step1`).
   * Used to map workflow-level SDK errors to form fields on initial load.
   */
  taskReference?: string | undefined;
  /**
   * Called on mount (and whenever the task changes) with the form's internal
   * reset function, so that the Cancel button rendered outside this component
   * can trigger a reset without lifting state.
   */
  onRegisterCancel?: ((reset: () => void) => void) | undefined;
  /**
   * Called whenever the form validity changes.  The Apply button rendered
   * outside this component uses this to enable/disable itself.
   */
  onValidityChange?: ((isValid: boolean) => void) | undefined;
};

export function TaskForm({
  nodeType,
  task,
  nodeId,
  taskReference,
  onRegisterCancel,
  onValidityChange,
}: TaskFormProps) {
  const { t } = useI18n();
  const { isReadOnly, model, errors, taskReferences } = useDiagramEditorContext();
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
  const formErrors = React.useMemo(() => buildFormErrors(t), [t]);

  const resolver = React.useMemo(
    () => (isReadOnly ? undefined : buildTaskFormResolver(allFields, formErrors)),
    // resolver only needs to change when allFields or locale-derived formErrors change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFields, isReadOnly, formErrors],
  );

  const methods = useForm<Record<string, unknown>>({
    defaultValues,
    // On-blur mode: validate each field when it loses focus.
    mode: "onBlur",
    ...(resolver !== undefined ? { resolver } : {}),
  });

  const { reset, setError, formState } = methods;

  // Track the last task value we successfully reset to, so we can detect
  // genuine model changes (e.g. undo/redo, external content prop) while the
  // same node stays selected.
  const prevTaskRef = React.useRef<Specification.Task>(task);

  // Reset form whenever the selected task changes (node selection change).
  React.useEffect(() => {
    prevTaskRef.current = task;
    reset(flattenTask(task as unknown));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, reset]);

  // Reset form when the model changes externally while the same node is still
  // selected (e.g. undo/redo, external content prop update). We compare
  // structurally to avoid spurious resets when the nodes array is rebuilt
  // with identical content.
  React.useEffect(() => {
    if (structuralEqual(task, prevTaskRef.current)) return;
    prevTaskRef.current = task;
    reset(flattenTask(task as unknown));
  }, [task, reset]);

  // ── Read-only: filter fields ──────────────────────────────────────────────
  const visibleFields = React.useMemo(() => {
    if (!isReadOnly) return allFields;
    return filterReadOnlyFields(allFields, task as Record<string, unknown>);
  }, [allFields, isReadOnly, task]);

  // ── Seed form errors from existing workflow-level SDK errors (edit mode) ──
  useWorkflowErrorsForForm(errors, taskReference, taskReferences, setError, nodeId);

  // Register the reset function with the parent (SidePanel) whenever the task changes.
  React.useEffect(() => {
    onRegisterCancel?.(() => reset(flattenTask(task as unknown)));
  }, [onRegisterCancel, reset, task]);

  // Notify the parent whenever the Apply-enabled state changes.
  // Apply is enabled when the form is dirty (has unsaved changes) and has no
  // validation errors. We deliberately avoid relying on `formState.isValid`
  // because in mode:"onBlur" it stays false until the first blur/trigger cycle,
  // which would incorrectly keep Apply disabled after a first-time field edit.
  const hasErrors = Object.keys(formState.errors).length > 0;
  const canApply = formState.isDirty && !hasErrors;

  React.useEffect(() => {
    if (isReadOnly) return;
    onValidityChange?.(canApply);
  }, [isReadOnly, onValidityChange, canApply]);

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
