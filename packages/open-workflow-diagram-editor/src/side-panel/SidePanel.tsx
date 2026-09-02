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
import { Workflow, Info, Box } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useDiagramEditorContext } from "@/store/DiagramEditorContext";
import { WorkflowInfoView } from "@/side-panel/WorkflowInfoView";
import { NodeDetailsView } from "@/side-panel/NodeDetailsView";
import { MermaidActions } from "@/side-panel/MermaidActions";
import { getNodeVisualConfig } from "@/react-flow/nodes/taskNodeConfig";
import type { BaseNodeData } from "@/react-flow/nodes/Nodes";
import { Button } from "@/components/ui/button";
import "./SidePanel.css";

export function SidePanel() {
  const { model, nodes, selectedNodeId, isReadOnly } = useDiagramEditorContext();
  const { setOpen } = useSidebar();
  const { t } = useI18n();

  // Ref to TaskForm's reset function — populated when TaskForm mounts via onRegisterCancel.
  const cancelRef = React.useRef<(() => void) | null>(null);

  // Apply button is enabled only when the form reports itself valid.
  const [isApplyEnabled, setIsApplyEnabled] = React.useState(false);

  const handleCancel = React.useCallback(() => {
    cancelRef.current?.();
  }, []);

  const handleApply = React.useCallback(() => {
    // TODO: trigger model update when model-update API is wired up.
  }, []);

  // TaskForm calls this with its internal reset function on mount.
  const onRegisterCancel = React.useCallback((fn: () => void) => {
    cancelRef.current = fn;
  }, []);

  // Reset Apply enabled state whenever the selected node changes.
  const prevSelectedNodeId = React.useRef(selectedNodeId);

  // TaskForm calls this whenever its validity changes.
  const onValidityChange = React.useCallback((isValid: boolean) => {
    setIsApplyEnabled(isValid);
  }, []);

  const selectedNode = React.useMemo(
    () =>
      selectedNodeId !== null
        ? ((nodes.find((n) => n.id === selectedNodeId) as RF.Node<BaseNodeData> | undefined) ??
          null)
        : null,
    [selectedNodeId, nodes],
  );

  const nodeConfig = getNodeVisualConfig(selectedNode?.type);

  const HeaderIcon = selectedNode ? (nodeConfig?.icon ?? Box) : Workflow;

  React.useEffect(() => {
    if (selectedNodeId !== prevSelectedNodeId.current) {
      setIsApplyEnabled(false);
    }
  }, [selectedNodeId]);

  React.useEffect(() => {
    if (selectedNodeId === prevSelectedNodeId.current) {
      return;
    }
    prevSelectedNodeId.current = selectedNodeId;
    setOpen(selectedNodeId !== null);
  }, [selectedNodeId, setOpen]);

  return (
    <Sidebar
      side="right"
      aria-label={selectedNode ? t("aria.panel.nodeDetails") : t("aria.panel.workflowInfo")}
      role="complementary"
    >
      <SidebarHeader>
        <div className="dec-sidebar-header-title">
          <span
            className={`dec-sidebar-header-icon-wrap${nodeConfig ? " colored" : ""}`}
            aria-hidden="true"
            style={
              nodeConfig
                ? ({ "--task-node-color": nodeConfig.color } as React.CSSProperties)
                : undefined
            }
          >
            <HeaderIcon className="dec-sidebar-header-icon" />
          </span>
          <div className="dec-sidebar-header-labels">
            <span className="dec-sidebar-header-name">
              {selectedNode ? selectedNode.data.label || t("sidebar.node") : t("sidebar.workflow")}
            </span>
            <span className="dec-sidebar-header-subtitle">
              {selectedNode ? (nodeConfig?.typeLabel ?? t("sidebar.node")) : t("sidebar.document")}
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent aria-label={t("aria.panel.content")} role="region">
        {selectedNode ? (
          <NodeDetailsView
            node={selectedNode}
            onRegisterCancel={onRegisterCancel}
            onValidityChange={onValidityChange}
          />
        ) : (
          <>
            <div className="dec-sidebar-hint">
              <Info className="dec-sidebar-hint-icon" aria-hidden="true" />
              <span className="dec-sidebar-hint-text">{t("sidebar.selectNode")}</span>
            </div>
            {model !== null ? <WorkflowInfoView document={model.document} /> : null}
          </>
        )}
      </SidebarContent>
      {model !== null && selectedNodeId === null ? (
        <SidebarFooter aria-label={t("aria.panel.exportActions")}>
          <MermaidActions model={model} />
        </SidebarFooter>
      ) : null}
      {selectedNode !== null && !isReadOnly ? (
        <SidebarFooter className="dec-task-form-actions" aria-label={t("aria.panel.formActions")}>
          <div className="dec-task-form-actions-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              aria-label={t("sidebar.form.cancel")}
            >
              {t("sidebar.form.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!isApplyEnabled}
              onClick={handleApply}
              aria-label={t("sidebar.form.apply")}
            >
              {t("sidebar.form.apply")}
            </Button>
          </div>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
