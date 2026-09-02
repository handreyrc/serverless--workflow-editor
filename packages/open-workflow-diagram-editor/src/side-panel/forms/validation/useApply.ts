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
import { toast } from "sonner";
import type { UseFormTrigger, UseFormSetError, UseFormGetValues } from "react-hook-form";
import type { Specification } from "@openworkflowspec/sdk";
import { updateTask, validateWorkflow, getNodeErrors, getNodeErrorField } from "@/core";
import type { SdkError } from "@/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reconstructs a nested task object from the flat dot-notation form values
 * produced by `flattenTask`.  Arrays (child-task-list values) are kept as-is.
 *
 * For example:
 *   `{ "for.each": "${items}", "for.in": "${data}" }`
 * becomes:
 *   `{ for: { each: "${items}", in: "${data}" } }`
 */
function unflattenValues(flat: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [dotPath, value] of Object.entries(flat)) {
    const parts = dotPath.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (
        current[part] === undefined ||
        typeof current[part] !== "object" ||
        Array.isArray(current[part])
      ) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1]!;
    current[lastPart] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// useApply
// ---------------------------------------------------------------------------

export type UseApplyOptions = {
  /**
   * The current workflow model.  Required to produce the draft via `updateTask`.
   */
  model: Specification.Workflow | null;
  /**
   * Non-indexed editor task id (e.g. `/do/step1`).  Used by `updateTask`.
   * Must match the id format described in `workflow-editing.md`.
   */
  nodeId: string | undefined;
  /**
   * RFC 6901-style indexed task reference (e.g. `/do/0/step1`).  Used to
   * look up errors in the SDK validation result for the selected task.
   */
  taskReference: string | undefined;
  /**
   * Full set of indexed task references, required by `getNodeErrors`.
   */
  taskReferences: Set<string>;
  /**
   * `trigger` from react-hook-form — triggers full form validation.
   */
  trigger: UseFormTrigger<Record<string, unknown>>;
  /**
   * `setError` from react-hook-form — used to highlight fields after
   * workflow-level re-validation errors are found.
   */
  setError: UseFormSetError<Record<string, unknown>>;
  /**
   * `getValues` from react-hook-form — reads the current form values.
   */
  getValues: UseFormGetValues<Record<string, unknown>>;
};

/**
 * Returns a stable `handleApply` callback that implements the two-stage
 * validation flow described in the task spec:
 *
 * **Stage 1 — form schema validation**
 * Triggers react-hook-form validation (using the `buildTaskFormResolver`
 * resolver wired into the form).  If there are errors the fields are already
 * highlighted by RHF; the apply is aborted.
 *
 * **Stage 2 — workflow draft validation**
 * Calls `updateTask` to produce a draft model, then re-validates it via the
 * SDK.  Only errors that belong to the selected task are surfaced:
 *
 * - If the selected task has errors in the draft → show a toast "This task
 *   has errors!" and highlight the relevant form fields.
 * - If the selected task has no errors in the draft → show a toast
 *   "Changes applied!" and add a TODO comment where model state update will
 *   live.
 *
 * Errors on other tasks in the draft are intentionally ignored.
 */
export function useApply({
  model,
  nodeId,
  taskReference,
  taskReferences,
  trigger,
  setError,
  getValues,
}: UseApplyOptions): () => Promise<void> {
  return React.useCallback(async () => {
    if (!model || !nodeId || !taskReference) return;

    // ── Stage 1: form schema validation ──────────────────────────────────────
    const isFormValid = await trigger();
    if (!isFormValid) {
      // RHF already highlighted the invalid fields via the resolver.
      return;
    }

    // ── Build updated task from flat form values ──────────────────────────────
    const flat = getValues();
    const updated = unflattenValues(flat) as Specification.Task;

    // ── Produce draft model ───────────────────────────────────────────────────
    let draftModel: Specification.Workflow;
    try {
      draftModel = updateTask(model, nodeId, updated);
    } catch {
      // updateTask throws only when the task id cannot be resolved — that
      // should never happen here since nodeId comes from the selected node.
      return;
    }

    // ── Stage 2: draft workflow validation ───────────────────────────────────
    const draftErrors: SdkError[] = validateWorkflow(draftModel);
    const taskErrors = getNodeErrors(draftErrors, taskReference, taskReferences);

    if (taskErrors.length > 0) {
      toast.error("This task has errors!");

      // Highlight the fields that have errors.
      for (const error of taskErrors) {
        const field = getNodeErrorField(error, taskReference);
        if (field === undefined) continue;
        setError(field, { type: "workflow", message: error.message });
      }
      return;
    }

    // TODO: Update the editor model state with the draft model here once
    //       the model-update / history API is wired up to the side panel.

    toast.success("Changes applied!");
  }, [model, nodeId, taskReference, taskReferences, trigger, setError, getValues]);
}
