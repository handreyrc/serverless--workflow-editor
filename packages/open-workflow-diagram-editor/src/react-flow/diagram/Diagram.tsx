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
import * as RF from "@xyflow/react";
import { useI18n } from "@openworkflowspec/i18n";
import { ReactFlowNodeTypes } from "../nodes/Nodes";
import "@xyflow/react/dist/style.css";
import "./Diagram.css";
import { ResolvedColorMode } from "../../types/colorMode";
import { ReactFlowEdgeTypes } from "../edges/Edges";
import { useDiagramEditorContext } from "../../store/DiagramEditorContext";
import { buildDiagramElements } from "./diagramBuilder";
import { applyAutoLayout } from "./autoLayout";
import { SidePanelTrigger } from "@/side-panel/SidePanelTrigger";
import { ZINDEX } from "../zIndexConstants";

const FIT_VIEW_OPTIONS: RF.FitViewOptions = {
  maxZoom: 1,
  minZoom: 0.1,
  duration: 400,
};

const applyEdgeZIndex = <T extends RF.Edge>(edges: T[]): T[] =>
  edges.map((edge) => ({
    ...edge,
    zIndex: edge.selected ? ZINDEX.EDGE_SELECTED : ZINDEX.EDGE_REGULAR,
  }));

export type DiagramProps = {
  divRef?: React.RefObject<HTMLDivElement | null>;
  colorMode?: ResolvedColorMode;
};

export const Diagram = ({ divRef, colorMode = "light" }: DiagramProps) => {
  const { t } = useI18n();
  // useReactFlow must be in deps of effects that use it (not initialised on first render).
  const reactFlowInstance: RF.ReactFlowInstance = RF.useReactFlow();
  const {
    model,
    errors,
    nodes,
    edges,
    isReadOnly,
    setNodes,
    setEdges,
    setSelectedNodeId,
    selectedNodeId,
    submitModel,
    pendingViewportRestore,
    clearPendingViewportRestore,
  } = useDiagramEditorContext();

  const [minimapVisible, setMinimapVisible] = React.useState(false);

  // Track whether fitView has run at least once in this edit session.
  const hasRunFitView = React.useRef<boolean>(false);

  // Ref to the latest selectedNodeId so the layout callback can stamp selection
  // without taking it as a dependency (avoids re-running layout on every click).
  const selectedNodeIdRef = React.useRef<string | null>(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  // True once the first layout has been committed to context — gates rendering the canvas
  // so React Flow mounts with nodes already positioned and fitView fires on real content.
  const [layoutReady, setLayoutReady] = React.useState(false);

  const onNodesChange = React.useCallback<RF.OnNodesChange>(
    (changes) => setNodes((nodesSnapshot) => RF.applyNodeChanges(changes, nodesSnapshot)),
    [setNodes],
  );

  const onEdgesChange = React.useCallback<RF.OnEdgesChange>(
    (changes) => {
      setEdges((edgesSnapshot) => {
        const updatedEdges = RF.applyEdgeChanges(changes, edgesSnapshot);
        return applyEdgeZIndex(updatedEdges);
      });
    },
    [setEdges],
  );

  const onSelectionChange = React.useCallback<RF.OnSelectionChangeFunc>(
    ({ nodes: selectedNodes }) => setSelectedNodeId(selectedNodes[0]?.id ?? null),
    [setSelectedNodeId],
  );

  // Rebuild nodes and edges when model or errors change (with debouncing).
  React.useEffect(() => {
    let isActive = true;
    let abortController: AbortController | null = null;

    // Debounce layout calculation to avoid excessive CPU usage on rapid changes.
    const debounceTimeoutId = setTimeout(() => {
      abortController = new AbortController();

      const graph = buildDiagramElements(model, errors);
      applyAutoLayout(graph, abortController.signal)
        .then(({ nodes, edges }) => {
          if (isActive && !abortController!.signal.aborted) {
            // Preserve selection: stamp selected:true on the node that matches
            // selectedNodeId so React Flow does not clear it when nodes are replaced.
            const selectedId = selectedNodeIdRef.current;
            const stampedNodes = selectedId
              ? nodes.map((n) => (n.id === selectedId ? { ...n, selected: true } : n))
              : nodes;
            setNodes(stampedNodes);
            setEdges(applyEdgeZIndex(edges));
            // On first load: reveal the canvas — React Flow will mount with nodes already
            // positioned and the fitView prop will fit them correctly on first render.
            setLayoutReady(true);
          }
        })
        .catch((error) => {
          if (error.name === "AbortError") {
            return;
          }
          console.error("Failed to apply auto-layout:", error);
        });
    }, 100);

    return () => {
      isActive = false;
      clearTimeout(debounceTimeoutId);
      abortController?.abort();
    };
  }, [model, errors, setNodes, setEdges]);

  // After each layout cycle: restore viewport (undo/redo) or fit (read-only re-layout),
  // then submit the model. The initial fitView on first mount is handled by the
  // fitView prop on <RF.ReactFlow> (fires once, duration:0, nodes already positioned).
  React.useEffect(() => {
    if (!layoutReady) return;

    let isActive = true;
    const id = setTimeout(() => {
      if (!isActive) return;

      if (pendingViewportRestore) {
        // Undo/redo — restore saved viewport instead of fitting.
        reactFlowInstance.setViewport(pendingViewportRestore);
        clearPendingViewportRestore();
        // Submit with the restored viewport directly — setViewport is async so
        // getViewport() would still return the old value at this point.
        if (model !== null) {
          submitModel(model, pendingViewportRestore, selectedNodeId);
        }
      } else {
        if (isReadOnly && hasRunFitView.current) {
          // Re-fit on subsequent read-only layout updates (e.g. content prop change).
          // duration:0 — no animation; the user expects an instant re-render, not a pan.
          reactFlowInstance.fitView({ ...FIT_VIEW_OPTIONS, duration: 0 });
        }

        // Track that first fitView has run (the RF prop fires on mount).
        if (!hasRunFitView.current) {
          hasRunFitView.current = true;
        }

        // Submit model with the real viewport captured after layout settles.
        // Diagram.tsx is the sole caller of submitModel.
        if (model !== null) {
          submitModel(model, reactFlowInstance.getViewport(), selectedNodeId);
        }
      }
    }, 0);

    return () => {
      isActive = false;
      clearTimeout(id);
    };
  }, [
    nodes,
    pendingViewportRestore,
    isReadOnly,
    reactFlowInstance,
    model,
    selectedNodeId,
    submitModel,
    clearPendingViewportRestore,
    layoutReady,
  ]);

  return (
    <div
      ref={divRef}
      className={isReadOnly ? "dec:h-full dec:relative read-only" : "dec:h-full dec:relative"}
      data-testid={"diagram-container"}
    >
      {!layoutReady ? null : (
        <RF.ReactFlow
          nodeTypes={ReactFlowNodeTypes}
          nodes={nodes}
          edgeTypes={ReactFlowEdgeTypes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={onSelectionChange}
          onlyRenderVisibleElements={true}
          zoomOnDoubleClick={false}
          elementsSelectable={true}
          panOnScroll={true}
          panOnDrag={false}
          zoomOnScroll={false}
          preventScrolling={true}
          selectionOnDrag={true}
          fitView
          fitViewOptions={{ ...FIT_VIEW_OPTIONS, duration: 0 }}
          colorMode={colorMode}
          defaultEdgeOptions={{
            markerEnd: {
              type: RF.MarkerType.ArrowClosed,
              width: 10,
              height: 10,
            },
          }}
          data-testid={"react-flow-canvas"}
          elevateEdgesOnSelect={false}
          nodesDraggable={false}
          nodesConnectable={!isReadOnly}
        >
          {minimapVisible && (
            <RF.MiniMap pannable zoomable position={"bottom-left"} maskStrokeWidth={2} />
          )}

          <RF.Panel position="top-right">
            <SidePanelTrigger />
          </RF.Panel>

          <RF.Controls
            fitViewOptions={FIT_VIEW_OPTIONS}
            position={"bottom-right"}
            showInteractive={false}
          >
            <RF.ControlButton
              onClick={() => setMinimapVisible(!minimapVisible)}
              aria-label={minimapVisible ? t("aria.minimap.hide") : t("aria.minimap.show")}
            >
              M
            </RF.ControlButton>
          </RF.Controls>
          <RF.Background className="diagram-background" variant={RF.BackgroundVariant.Dots} />
        </RF.ReactFlow>
      )}
    </div>
  );
};
