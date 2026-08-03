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

/**
 * schemaRegistry — resolves the JSON Schema sub-schema for a given OWF task type.
 *
 * The workflow.json schema is loaded once at module load time (static import).
 * No React, no SDK, no store, no DOM dependency — importable in Node.js test environments.
 *
 * Task type → $defs key mapping:
 *   "call"   → callTask
 *   "do"     → doTask
 *   "emit"   → emitTask
 *   "for"    → forTask
 *   "fork"   → forkTask
 *   "listen" → listenTask
 *   "raise"  → raiseTask
 *   "run"    → runTask
 *   "set"    → setTask
 *   "switch" → switchTask
 *   "try"    → tryTask
 *   "wait"   → waitTask
 */

import workflowSchema from "./schema/workflow.json" with { type: "json" };

export type JSONSchemaObject = Record<string, unknown>;

/** Map from OWF task type key (e.g. "set") to its $defs key in the schema (e.g. "setTask"). */
const TASK_TYPE_TO_DEF: Record<string, string> = {
  call: "callTask",
  do: "doTask",
  emit: "emitTask",
  for: "forTask",
  fork: "forkTask",
  listen: "listenTask",
  raise: "raiseTask",
  run: "runTask",
  set: "setTask",
  switch: "switchTask",
  try: "tryTask",
  wait: "waitTask",
};

export const schemaDefs =
  (workflowSchema as { $defs?: Record<string, JSONSchemaObject> }).$defs ?? {};
const taskBaseDef = schemaDefs["taskBase"] as JSONSchemaObject | undefined;
export const rootWorkflowSchema: JSONSchemaObject = workflowSchema as JSONSchemaObject;

/**
 * Returns the full JSON Schema sub-schema object for the given OWF task type.
 * Returns null if the task type is unknown or the schema cannot be resolved.
 * Never throws.
 */
export function getSubSchema(taskType: string): JSONSchemaObject | null {
  const defKey = TASK_TYPE_TO_DEF[taskType];
  if (!defKey) return null;
  const def = schemaDefs[defKey];
  if (!def) return null;
  return def as JSONSchemaObject;
}

/**
 * Returns the taskBase schema — containing the common fields shared by all task types.
 * Used to resolve inherited scalar fields such as "if".
 */
export function getTaskBaseSchema(): JSONSchemaObject | null {
  return taskBaseDef ?? null;
}

/**
 * Returns the list of known OWF task type keys (e.g. "set", "wait", "call").
 */
export function getKnownTaskTypes(): string[] {
  return Object.keys(TASK_TYPE_TO_DEF);
}
