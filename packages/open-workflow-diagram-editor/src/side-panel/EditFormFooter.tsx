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
import type { BaseNodeData } from "@/react-flow/nodes/Nodes";
import { useI18n } from "@openworkflowspec/i18n";
import { SidebarFooter } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useFormState } from "react-hook-form";
import { updateTask } from "@/core/workflowEditing";
import { applyDirtyValues } from "@/core/taskDraft";
import { flattenTask } from "@/side-panel/forms/TaskForm";
import { computeSentinelDefaults } from "@/side-panel/forms/FormField";
import { getFormFieldsForNodeType } from "@/core";
import { useDiagramEditorContext } from "@/store/DiagramEditorContext";
import { useEditSession } from "./EditSession";
import { Check } from "lucide-react";
import type { Specification } from "@openworkflowspec/sdk";

/* How long the applied message stays in footer */
const APPLIED_MESSAGE_MS = 2400;

type DraftStatusProps = {
  changedCount: number;
  isDirty: boolean;
  showApplied: boolean;
};

function DraftStatus({ changedCount, isDirty, showApplied }: DraftStatusProps) {
  const { t } = useI18n();

  const variant = isDirty ? "changed" : showApplied ? "applied" : "nochanges";
  const label =
    variant === "changed"
      ? `${changedCount} ${t("sidebar.form.changed")}`
      : variant === "applied"
        ? t("sidebar.form.applied")
        : t("sidebar.form.noChanges");

  return (
    <span className={`dec-sidebar-form-footer-status ${variant}`} role="status">
      {variant === "applied" ? (
        <Check className="dec-sidebar-form-footer-status-icon" aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
}

export function EditFormFooter({ node }: { node: RF.Node<BaseNodeData> }) {
  const { t } = useI18n();
  const { form } = useEditSession();
  const { commitWorkflow, isReadOnly, model } = useDiagramEditorContext();

  const [appliedNodeId, setAppliedNodeId] = React.useState<string | null>(null);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (dismissTimer.current !== null) {
        clearTimeout(dismissTimer.current);
      }
    },
    [],
  );

  const { isDirty } = useFormState({ control: form.control });
  const task = node.data.task;
  const showApplied = appliedNodeId === node.id;

  // Guard conditions that permanently prevent display
  if (isReadOnly || task === undefined || node.data.taskReference === undefined || model === null) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changedCount = Object.keys(
    flattenTask((form.control as any)._formState.dirtyFields ?? {}),
  ).filter((p) => !p.startsWith("__oneof__.")).length;

  const handleCancel = () => {
    const nodeType = node.type ?? "";
    const allFields = nodeType ? getFormFieldsForNodeType(nodeType) : [];
    const sentinelDefaults = computeSentinelDefaults(allFields, task as Record<string, unknown>);
    form.reset({
      ...(task as Record<string, unknown>),
      ...(Object.keys(sentinelDefaults).length > 0 ? { __oneof__: sentinelDefaults } : {}),
    });
    setAppliedNodeId(null);
  };

  const handleApply = () => {
    // TODO: Should add error handling if apply fails but first need to decide how to display that to the user before implementing
    // RHF stores form values as a nested object (dot-notation names are resolved
    // as nested paths internally). Flatten back to dot-notation so applyDirtyValues
    // can match keys against its dirtyPaths set correctly.
    const flatValues = flattenTask(form.getValues());
    // dirtyFields is also nested: { timeout: { after: { hours: true } } }.
    // Flatten it the same way to get leaf dot-notation paths.
    // Use control._formState.dirtyFields directly: the subscribed `dirtyFields`
    // from useFormState only populates fields accessed via the proxy, but the
    // sentinel fields registered via register() (not Controller) only appear
    // in the internal _formState and not in the proxy-gated public surface.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawFlatDirty = Object.keys(
      flattenTask((form.control as any)._formState.dirtyFields ?? {}),
    );
    const flatDirty = new Set<string>();
    // Sentinel paths: dirty solely because the variant selector changed.
    // Kept separate so applyDirtyValues can handle them correctly — they always
    // delete the model property unless the field is also independently dirty.
    const sentinelPaths = new Set<string>();
    for (const path of rawFlatDirty) {
      if (path.startsWith("__oneof__.")) {
        sentinelPaths.add(path.slice("__oneof__.".length));
      } else {
        flatDirty.add(path);
      }
    }
    const updated = applyDirtyValues(
      task as unknown as Record<string, unknown>,
      flatValues,
      flatDirty,
      sentinelPaths,
    ) as Specification.Task;
    const updatedModel = updateTask(model, node.id, updated);
    commitWorkflow(updatedModel);
    // Reset to the committed task state (not form.getValues()) so that
    // defaultValues reflect what was actually saved. form.getValues() falls
    // back to _defaultValues for paths that were cleared with shouldDirty:false
    // (e.g. the old variant's fields after a kind-boundary switch), causing
    // stale values like the previous Expression string to reappear in
    // StructuredValueField after apply.
    const nodeType = node.type ?? "";
    const allFields = nodeType ? getFormFieldsForNodeType(nodeType) : [];
    const sentinelDefaults = computeSentinelDefaults(allFields, updated as Record<string, unknown>);
    form.reset({
      ...(updated as Record<string, unknown>),
      ...(Object.keys(sentinelDefaults).length > 0 ? { __oneof__: sentinelDefaults } : {}),
    });
    setAppliedNodeId(node.id);

    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
    }

    dismissTimer.current = setTimeout(() => setAppliedNodeId(null), APPLIED_MESSAGE_MS);
  };

  return (
    <SidebarFooter>
      <div className="dec-sidebar-form-footer">
        <DraftStatus changedCount={changedCount} isDirty={isDirty} showApplied={showApplied} />
        <div className="dec-sidebar-form-footer-actions">
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t("sidebar.form.cancel")}
          </Button>
          <Button type="button" onClick={handleApply} disabled={!isDirty}>
            {t("sidebar.form.apply")}
          </Button>
        </div>
      </div>
    </SidebarFooter>
  );
}
