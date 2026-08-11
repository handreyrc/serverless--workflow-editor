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
import { dump } from "js-yaml";
import { buildFlatGraph, getTaskReferences, parseWorkflow } from "../core";
import type { Specification } from "@openworkflowspec/sdk";
import { DiagramEditorProps, DiagramEditorRef } from "../diagram-editor/DiagramEditor";
import {
  ContentFormat,
  DiagramEditorContext,
  DiagramEditorContextType,
} from "./DiagramEditorContext";
import type * as RF from "@xyflow/react";
import { useWorkflowHistory } from "../react-flow/hooks/useWorkflowHistory";

export type ContextProviderProps = DiagramEditorProps;

/**
 * Resolves the currently selected node/edge ID against a new model.
 * Returns the same ID if it still exists in the graph, or null if it was removed.
 */
function resolveSelectedId(model: Specification.Workflow, currentId: string | null): string | null {
  if (currentId === null) return null;
  const graph = buildFlatGraph(model);
  return graph.nodes.some((n) => n.id === currentId) || graph.edges.some((e) => e.id === currentId)
    ? currentId
    : null;
}

export const DiagramEditorContextProvider = React.forwardRef<
  DiagramEditorRef,
  React.PropsWithChildren<ContextProviderProps>
>((props, ref) => {
  // Detect the serialization format once from the initial content prop.
  // JSON content starts with `{` (after trimming); everything else is YAML.
  // We use a ref so the format is fixed at mount time and never flips mid-session
  // (an undo/redo should round-trip back in the same format the host provided).
  const contentFormat = React.useRef<ContentFormat>(
    props.content.trimStart().startsWith("{") ? "json" : "yaml",
  );

  // Force a re-render when contentFormat is updated imperatively via setContent
  // (refs don't trigger re-renders on their own).
  const [contentFormatVersion, setContentFormatVersion] = React.useState(0);

  // Config state (non-history)
  const [locale, setLocale] = React.useState<string>(props.locale);
  const [nodes, setNodes] = React.useState([] as RF.Node[]);
  const [edges, setEdges] = React.useState([] as RF.Edge[]);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

  // Read isReadOnly directly from props — no local state copy.
  // This ensures useWorkflowHistory always receives the current value without
  // a one-render lag from useState + useEffect synchronisation.
  const isReadOnly = props.isReadOnly;

  // History — starts uninitialised (present = null).
  // Diagram.tsx is the sole caller of submitModel (after layout, with real viewport).
  const {
    model,
    seedModel,
    submitModel,
    undo: historyUndo,
    redo: historyRedo,
    canUndo,
    canRedo,
    pendingViewportRestore,
    clearPendingViewportRestore,
  } = useWorkflowHistory(isReadOnly);

  // parseWorkflow drives both errors and the external-content model source.
  // errors are never part of a snapshot — always recomputed from current content.
  const { model: parsedModel, errors } = React.useMemo(
    () => parseWorkflow(props.content),
    [props.content],
  );

  // Seed history from the external content prop using seedModel (bypasses isReadOnly guard).
  // The real viewport is set by Diagram.tsx once layout completes in edit mode.
  // In read-only mode the placeholder viewport is acceptable since fitView always runs.
  // Keep a ref to the latest selectedNodeId so the effect below can read it
  // synchronously without taking it as a dependency (avoids re-seeding on every click).
  const selectedNodeIdRef = React.useRef<string | null>(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  React.useEffect(() => {
    if (parsedModel === null) {
      // Null model is never stored in history.
      return;
    }
    // Preserve selection across content reloads (e.g. addon-panel edits): only clear
    // selectedNodeId when the previously-selected node/edge no longer exists in the
    // new model. We read the ref synchronously so we can pass the same resolved value
    // to both setSelectedNodeId and seedModel in one shot.
    const resolvedId = resolveSelectedId(parsedModel, selectedNodeIdRef.current);
    setSelectedNodeId(resolvedId);
    seedModel(parsedModel, { x: 0, y: 0, zoom: 1 }, resolvedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally omitting selectedNodeIdRef and seedModel:
    // - selectedNodeIdRef is a ref (stable, mutated inline — not a dep by convention)
    // - seedModel is a useCallback with stable identity; including it would re-seed on
    //   every selection change because its deps would change too
  }, [parsedModel]);

  const taskReferences = React.useMemo(
    () => (model ? getTaskReferences(buildFlatGraph(model)) : new Set<string>()),
    [model],
  );

  // Sync locale state when the prop changes.
  React.useEffect(() => {
    setLocale(props.locale);
  }, [props.locale]);

  /**
   * Imperative API: load a new workflow from a YAML or JSON string.
   * Mirrors exactly what the props.content effect does, plus updates contentFormat.
   */
  const setContent = React.useCallback(
    (content: string) => {
      const { model: newModel } = parseWorkflow(content);
      if (newModel === null) return;

      const newFormat: ContentFormat = content.trimStart().startsWith("{") ? "json" : "yaml";
      if (newFormat !== contentFormat.current) {
        contentFormat.current = newFormat;
        setContentFormatVersion((v) => v + 1);
      }

      const resolvedId = resolveSelectedId(newModel, selectedNodeIdRef.current);
      setSelectedNodeId(resolvedId);
      seedModel(newModel, { x: 0, y: 0, zoom: 1 }, resolvedId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seedModel],
  );

  // Bind setSelectedNodeId into undo/redo wrappers via direct callback.
  // This keeps selection restore atomic with the history dispatch.
  const undo = React.useCallback(() => {
    historyUndo(setSelectedNodeId);
  }, [historyUndo]);

  const redo = React.useCallback(() => {
    historyRedo(setSelectedNodeId);
  }, [historyRedo]);

  const getContent = React.useCallback(() => {
    if (!model) return "";
    const plain = JSON.parse(JSON.stringify(model)) as Record<string, unknown>;
    return contentFormat.current === "json"
      ? JSON.stringify(plain, null, 2)
      : dump(plain, { indent: 2, lineWidth: -1 });
  }, [model]);

  React.useImperativeHandle(
    ref as React.Ref<DiagramEditorRef>,
    () => ({ undo, redo, canUndo, canRedo, getContent, setContent }),
    [undo, redo, canUndo, canRedo, getContent, setContent],
  );

  // Memoize context value to prevent unnecessary re-renders of consumers.
  const context = React.useMemo<DiagramEditorContextType>(
    () => ({
      isReadOnly,
      locale,
      // contentFormat.current is read here so the memo always captures the current
      // format after an imperative setContent call. contentFormatVersion (in the
      // dependency array below) busts the memo whenever the format ref is mutated.
      contentFormat: contentFormat.current,
      model,
      errors,
      nodes,
      edges,
      taskReferences,
      selectedNodeId,
      setLocale,
      setNodes,
      setEdges,
      setSelectedNodeId,
      submitModel,
      undo,
      redo,
      canUndo,
      canRedo,
      pendingViewportRestore,
      clearPendingViewportRestore,
      setContent,
    }),
    [
      isReadOnly,
      locale,
      contentFormatVersion,
      // contentFormat.current is a ref — stable, no need to list as dep.
      model,
      errors,
      nodes,
      edges,
      taskReferences,
      selectedNodeId,
      setLocale,
      setNodes,
      setEdges,
      setSelectedNodeId,
      submitModel,
      undo,
      redo,
      canUndo,
      canRedo,
      pendingViewportRestore,
      clearPendingViewportRestore,
      setContent,
    ],
  );

  return (
    <DiagramEditorContext.Provider value={context}>{props.children}</DiagramEditorContext.Provider>
  );
});
