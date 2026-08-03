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
import { buildFlatGraph, parseWorkflow } from "../core";
import { DiagramEditorProps } from "../diagram-editor/DiagramEditor";
import { DiagramEditorContext, DiagramEditorContextType } from "./DiagramEditorContext";
import type * as RF from "@xyflow/react";
import type { Specification } from "@openworkflowspec/sdk";

export type ContextProviderProps = Omit<DiagramEditorProps, "ref">;

export const DiagramEditorContextProvider = (
  props: React.PropsWithChildren<ContextProviderProps>,
) => {
  // Initialize states with props values
  const [isReadOnly, setIsReadOnly] = React.useState<boolean>(props.isReadOnly);
  const [locale, setLocale] = React.useState<string>(props.locale);
  const [nodes, setNodes] = React.useState([] as RF.Node[]);
  const [edges, setEdges] = React.useState([] as RF.Edge[]);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

  // model is derived from parsed content; mutable copy allows updateTask to write back
  const { model: parsedModel, errors } = React.useMemo(
    () => parseWorkflow(props.content),
    [props.content],
  );
  const [model, setModel] = React.useState<Specification.Workflow | null>(parsedModel);

  // Keep model in sync with parsed content when props.content changes
  React.useEffect(() => {
    setModel(parsedModel);
  }, [parsedModel]);

  const nodeIds = React.useMemo(
    () => (model ? new Set(buildFlatGraph(model).nodes.map((node) => node.id)) : new Set<string>()),
    [model],
  );

  // Update states on props changes
  React.useEffect(() => {
    setIsReadOnly(props.isReadOnly);
    setLocale(props.locale);
  }, [props.isReadOnly, props.locale, setIsReadOnly, setLocale]);

  // Clear selectedNodeId when parsed model changes (content changed externally)
  React.useEffect(() => {
    setSelectedNodeId(null);
  }, [parsedModel]);

  /**
   * Extracts the task name (key in model.do) from a flat-graph node ID.
   * The SDK generates node IDs as path strings, e.g. "/do/myTask" for top-level tasks.
   * The task name key in model.do is the last path segment ("myTask").
   * Falls back to the full nodeId if it contains no slash (already a plain name).
   */
  function taskNameFromNodeId(nodeId: string): string {
    const lastSlash = nodeId.lastIndexOf("/");
    return lastSlash >= 0 ? nodeId.slice(lastSlash + 1) : nodeId;
  }

  /**
   * Returns the live task object for the given nodeId from model.do.
   * Always reads from the current in-memory model — not from stale node.data.task.
   * model.do is TaskItem[] where each TaskItem = { [taskName]: Task }.
   * The nodeId from the flat graph is a path like "/do/myTask" — the task name is
   * the last path segment, which matches the key in model.do.
   */
  const getTask = React.useCallback(
    (nodeId: string): Specification.Task | undefined => {
      if (!model?.do) return undefined;
      const taskName = taskNameFromNodeId(nodeId);
      for (const taskItem of model.do) {
        if (typeof taskItem !== "object" || taskItem === null) continue;
        const key = Object.keys(taskItem)[0];
        if (key === taskName) {
          return (taskItem as Record<string, Specification.Task>)[key];
        }
      }
      return undefined;
    },
    [model],
  );

  /**
   * Replaces the task identified by nodeId in model.do.
   * model.do is a TaskItem[] where each TaskItem = { [taskName]: Task }.
   * The nodeId from the flat graph is a path like "/do/myTask" — the task name is
   * the last path segment, which is the key to replace in model.do.
   * Architecture AD-03: this is the single write action; no other context state is added.
   *
   * TODO: When undo/redo is implemented, wire the mutation through the undo/redo stack
   *       instead of directly replacing the task. Also update the React Flow nodes state
   *       to reflect the change once the diagram is linked to the model (Milestone 2).
   */
  const updateTask = React.useCallback((nodeId: string, updatedTask: Specification.Task) => {
    const taskName = taskNameFromNodeId(nodeId);
    setModel((current) => {
      if (!current?.do) return current;
      const newDo = current.do.map((taskItem) => {
        if (typeof taskItem !== "object" || taskItem === null) return taskItem;
        const key = Object.keys(taskItem)[0];
        if (key === taskName) {
          return { [key]: updatedTask } as Specification.TaskItem;
        }
        return taskItem;
      });
      return { ...current, do: newDo } as Specification.Workflow;
    });
  }, []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const context = React.useMemo<DiagramEditorContextType>(
    () => ({
      isReadOnly,
      locale,
      model,
      errors,
      nodes,
      edges,
      nodeIds,
      selectedNodeId,
      setIsReadOnly,
      setLocale,
      setNodes,
      setEdges,
      setSelectedNodeId,
      updateTask,
      getTask,
    }),
    [
      isReadOnly,
      locale,
      model,
      errors,
      nodes,
      edges,
      nodeIds,
      selectedNodeId,
      setIsReadOnly,
      setLocale,
      setNodes,
      setEdges,
      setSelectedNodeId,
      updateTask,
      getTask,
    ],
  );

  return (
    <DiagramEditorContext.Provider value={context}>{props.children}</DiagramEditorContext.Provider>
  );
};
