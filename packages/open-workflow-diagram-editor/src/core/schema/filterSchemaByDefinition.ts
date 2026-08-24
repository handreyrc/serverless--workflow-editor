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

import { merge } from "allof-merge";
import workflowSchema from "./workflow.json";

/* The $defs block of workflow.json contains every named definition.
 * Each entry is a valid JSON Schema Draft 2020-12 object. */
type WorkflowDefs = (typeof workflowSchema)["$defs"];

/* Names of all top-level definitions available in the workflow schema. */
export type WorkflowDefinitionName = keyof WorkflowDefs;

/* A fully dereferenced, self-contained JSON schema object.
 * All $ref pointers have been replaced and allOf compositions merged. */
export type DereferencedSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

let _merged: Record<string, unknown> | null = null;
const _definitionCache = new Map<string, DereferencedSchema>();
let _taskBaseTitles: Set<string> | null = null;

function getMergedSchema(): Record<string, unknown> {
  if (_merged === null) {
    _merged = merge(workflowSchema, { source: workflowSchema }) as Record<string, unknown>;
  }
  return _merged;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Collects the names of all `$defs` entries that are directly referenced by
 * a definition, excluding structural scaffolding (`taskBase`, `taskList`).
 *
 * These are the meaningful sub-definitions a consumer may want to resolve
 * independently — e.g. `retryPolicy` inside `tryTask`,
 * `eventConsumptionStrategy` inside `listenTask`, or `endpoint` inside
 * `callTask`.
 */
export function getReferencedDefinitions(definitionName: WorkflowDefinitionName): string[] {
  const rawDefs = workflowSchema.$defs as Record<string, unknown>;
  const node = rawDefs[definitionName];
  if (node === undefined) return [];

  const STRUCTURAL = new Set(["taskBase", "taskList"]);
  const found = new Set<string>();

  function collect(obj: unknown): void {
    if (Array.isArray(obj)) {
      obj.forEach(collect);
      return;
    }
    if (obj !== null && typeof obj === "object") {
      const rec = obj as Record<string, unknown>;
      const ref = rec["$ref"];
      if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
        const name = ref.slice("#/$defs/".length);
        if (!STRUCTURAL.has(name)) found.add(name);
      }
      Object.values(rec).forEach(collect);
    }
  }

  collect(node);
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively deep clones a value, breaking cyclic references while fully
 * preserving non-cyclic shared DAG references (preventing duplicate drops).
 *
 * Tracking the active traversal path via the `stack` Set allows us to identify
 * and break true cyclic loops (by returning `undefined` for ancestors) without
 * dropping sibling nodes that happen to refer to the same object (DAG structures).
 *
 * @param value - The value to deep clone.
 * @param stack - The active traversal stack containing ancestor objects.
 * @returns A deep clone of the value with broken cycles.
 */
function cloneDeepSafe(value: unknown, stack = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  // Detect and break cycles
  if (stack.has(value as object)) {
    return undefined;
  }

  stack.add(value as object);

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    for (const item of value) {
      const clonedItem = cloneDeepSafe(item, stack);
      if (clonedItem !== undefined) {
        clone.push(clonedItem);
      }
    }
    stack.delete(value as object);
    return clone;
  }

  const clone: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const clonedVal = cloneDeepSafe(val, stack);
    if (clonedVal !== undefined) {
      clone[key] = clonedVal;
    }
  }
  stack.delete(value as object);
  return clone;
}

/**
 * Builds the set of `title` values used on `taskBase.properties` entries.
 */
function getTaskBaseTitles(): Set<string> {
  const rawDefs = workflowSchema.$defs as Record<string, unknown>;
  const taskBase = rawDefs["taskBase"] as Record<string, unknown> | undefined;
  const props = taskBase?.["properties"] as Record<string, Record<string, unknown>> | undefined;
  const titles = new Set<string>();
  if (props) {
    for (const propSchema of Object.values(props)) {
      if (typeof propSchema?.["title"] === "string") {
        titles.add(propSchema["title"] as string);
      }
      const oneOf = propSchema?.["oneOf"] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(oneOf)) {
        for (const variant of oneOf) {
          if (typeof variant?.["title"] === "string") titles.add(variant["title"] as string);
        }
      }
    }
  }
  return titles;
}

/**
 * Recursively collects every `#/$defs/<name>` reference name found anywhere
 * inside `node`, including transitively through referenced definitions.
 *
 * Uses a `WeakSet` to track already-visited objects so that circular
 * references in the merged schema (e.g. `eventConsumptionStrategy`, which
 * `allof-merge` can represent as a shared object cycle) do not cause a stack
 * overflow. The `visitedNames` set prevents re-scanning defs we've already
 * queued.
 *
 * @param root - The schema node to scan.
 * @param mergedDefs - The full `$defs` block map.
 * @returns A set of transitive definition reference names.
 */
function collectTransitiveRefs(root: unknown, mergedDefs: Record<string, unknown>): Set<string> {
  const visitedNames = new Set<string>();
  const visitedObjs = new WeakSet<object>();

  function scan(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(scan);
      return;
    }
    if (node !== null && typeof node === "object") {
      if (visitedObjs.has(node as object)) return;
      visitedObjs.add(node as object);
      const rec = node as Record<string, unknown>;
      const ref = rec["$ref"];
      if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
        const name = ref.slice("#/$defs/".length);
        if (!visitedNames.has(name)) {
          visitedNames.add(name);
          scan(mergedDefs[name]);
        }
      }
      Object.values(rec).forEach(scan);
    }
  }

  scan(root);
  return visitedNames;
}

/**
 * Single-pass schema transformer.
 * Currently strips `title` values that originate from `taskBase` property
 * schemas — they are inherited during the allOf merge and would shadow the
 * correct task-level title.
 */
function transformSchema(node: unknown, visited = new WeakSet<object>()): void {
  if (node === null || typeof node !== "object") return;
  if (visited.has(node as object)) return;
  visited.add(node as object);

  if (Array.isArray(node)) {
    for (const item of node) {
      transformSchema(item, visited);
    }
    return;
  }

  const rec = node as Record<string, unknown>;

  // Strip taskBase-origin annotation titles
  if (_taskBaseTitles === null) _taskBaseTitles = getTaskBaseTitles();
  if (typeof rec["title"] === "string" && _taskBaseTitles.has(rec["title"] as string)) {
    delete rec["title"];
  }

  // Recurse down
  for (const value of Object.values(rec)) {
    transformSchema(value, visited);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a single named definition from the workflow JSON schema into a
 * **fully formed, self-contained JSON Schema object**.
 *
 * Uses `allof-merge` to perform two operations in a single pass over the
 * full schema:
 *
 * 1. **`$ref` resolution** — every `#/$defs/<name>` pointer is replaced with
 *    the schema it points to.
 *
 * 2. **`allOf` flattening** — `allOf` compositions are merged into the parent
 *    object, so inherited `taskBase` fields (`if`, `input`, `output`,
 *    `export`, `timeout`, `then`, `metadata`) are inlined directly into the
 *    task's own `properties` map alongside the task-specific fields. Each
 *    `oneOf` variant (e.g. `CallHTTP`, `CallGRPC` inside `callTask`) is also
 *    flattened individually.
 *
 * Because `allof-merge` does not resolve standalone `$ref`s inside
 * `properties`, the returned schema includes a `$defs` block containing every
 * transitively referenced definition (e.g. `input` → `schema` →
 * `externalResource`). Consumers using a standard JSON Schema validator or
 * form generator can therefore resolve all remaining `$ref` pointers without
 * access to the original full schema.
 *
 * The merge result is cached at module level, so repeated calls for different
 * definitions are O(1) after the first call.
 *
 * @param definitionName - The definition key from `$defs`, e.g. `"setTask"`,
 *   `"callTask"`, `"retryPolicy"`, etc.
 * @returns A flat, fully resolved schema for the requested definition.
 * @throws {Error} If the definition does not exist in the schema.
 */
export function getSchemaForDefinition(definitionName: WorkflowDefinitionName): DereferencedSchema {
  const cached = _definitionCache.get(definitionName);
  if (cached !== undefined) return cached;

  const merged = getMergedSchema();
  const defs = merged["$defs"] as Record<string, unknown> | undefined;
  const definition = defs?.[definitionName];

  if (definition === undefined) {
    throw new Error(`Definition "${definitionName}" not found in workflow schema $defs.`);
  }

  const referencedNames = collectTransitiveRefs(definition, defs ?? {});
  const result = cloneDeepSafe(definition) as Record<string, unknown>;

  if (referencedNames.size > 0) {
    const bundledDefs: Record<string, unknown> = {};
    for (const name of referencedNames) {
      if (defs?.[name] !== undefined) {
        bundledDefs[name] = cloneDeepSafe(defs[name]);
      }
    }
    result.$defs = bundledDefs;
  }

  transformSchema(result);

  _definitionCache.set(definitionName, result);
  return result;
}
