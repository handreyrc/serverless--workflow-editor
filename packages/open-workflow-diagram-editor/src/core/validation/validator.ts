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
 * validator — public API for the validation core.
 *
 * Exposes four named functions:
 *   - getFieldDescriptors(taskType)                     → FieldDescriptor[]
 *   - validateTask(taskType, task)                      → ErrorItem[]
 *   - validateField(taskType, fieldName, value)         → ErrorItem[]
 *   - validate(workflow)                               → ErrorItem[]
 *
 * No React, no SDK, no store, no DOM dependency.
 * Importable in Node.js (Vitest) test environments.
 */

import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject } from "ajv";
import {
  getSubSchema,
  getTaskBaseSchema,
  schemaDefs,
  rootWorkflowSchema,
  type JSONSchemaObject,
} from "./schemaRegistry";
import { normalizeErrors, type ErrorItem } from "./errorNormalizer";
import type { FieldDescriptor, FieldConstraints } from "./types";
export type { FieldDescriptor, FieldConstraints } from "./types";
export type { ErrorItem } from "./errorNormalizer";

/**
 * Task base fields that are always non-editable regardless of edit mode.
 * Mirrors the TASK_BASE_KEYS exclusion in taskDetails.ts but extended with
 * the flow-control fields that should not be edited in the PoC.
 * "then" describes task ordering, not task configuration — it is excluded.
 */
const NON_EDITABLE_BASE_FIELDS = new Set([
  "if", // Keep — "if" IS editable (it is a scalar string in taskBase)
  "input",
  "output",
  "export",
  "timeout",
  "then",
  "metadata",
]);

// "if" is editable; remove it from the non-editable set so it shows up in descriptors
NON_EDITABLE_BASE_FIELDS.delete("if");

/**
 * Task-type discriminator keys — these are the keys that identify the task type.
 * They are always read-only (the type cannot be changed by editing a field).
 */
const TASK_TYPE_KEYS = new Set([
  "call",
  "do",
  "emit",
  "for",
  "fork",
  "listen",
  "raise",
  "run",
  "set",
  "switch",
  "try",
  "wait",
]);

/**
 * AJV instance configured for JSON Schema 2020-12.
 * Strict mode is off because the OWF schema uses `unevaluatedProperties` which can conflict
 * with additional AJV strictness settings.
 */
const ajv = new Ajv2020({ strict: false, allErrors: true });

/** Cache for compiled validators, keyed by schema identity (task type key). */
const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();

/** Compile and cache a validator for a given schema object. */
function getValidator(schemaKey: string, schema: JSONSchemaObject): ReturnType<typeof ajv.compile> {
  const cached = validatorCache.get(schemaKey);
  if (cached) return cached;
  // Add the root schema as a reference so $ref resolution works within the sub-schemas
  const validator = ajv.compile(schema);
  validatorCache.set(schemaKey, validator);
  return validator;
}

/**
 * Transforms a camelCase or PascalCase identifier into a human-readable "Title Case" string.
 * Examples: "fieldName" → "Field Name", "HTTPEndpoint" → "HTTP Endpoint"
 */
function camelToLabel(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Extracts scalar constraints from a property schema object.
 */
function extractConstraints(propSchema: JSONSchemaObject): FieldConstraints {
  const c: FieldConstraints = {};
  if (typeof propSchema.minLength === "number") c.minLength = propSchema.minLength;
  if (typeof propSchema.maxLength === "number") c.maxLength = propSchema.maxLength;
  if (typeof propSchema.pattern === "string") c.pattern = propSchema.pattern;
  if (typeof propSchema.minimum === "number") c.minimum = propSchema.minimum;
  if (typeof propSchema.maximum === "number") c.maximum = propSchema.maximum;
  if (Array.isArray(propSchema.enum)) c.enum = propSchema.enum as unknown[];
  return c;
}

/**
 * Determines the scalar TypeScript type from a JSON Schema property definition.
 * Returns undefined for complex/array/object types (excluded from editable fields).
 */
function scalarType(propSchema: JSONSchemaObject): "string" | "number" | "boolean" | undefined {
  const t = propSchema.type;
  if (t === "string") return "string";
  if (t === "number" || t === "integer") return "number";
  if (t === "boolean") return "boolean";
  return undefined;
}

/**
 * For schemas that use `oneOf` (e.g. callTask, runTask), picks the correct variant
 * by matching `const` discriminator values against the actual task object's properties.
 *
 * Each `oneOf` variant's `allOf` typically contains an entry with
 * `properties: { <discriminatorKey>: { const: "<value>" } }`. We scan all `allOf` entries
 * across all variants and pick the first one where every `const` in that entry's properties
 * matches the corresponding value in the task object.
 *
 * Falls back to the first variant if no discriminator can be matched (e.g. CallFunction
 * which has no `const` constraint on `call`).
 *
 * Returns null if the schema has no `oneOf`.
 */
function resolveOneOfVariant(
  schemaObj: JSONSchemaObject,
  taskObj: Record<string, unknown>,
): JSONSchemaObject | null {
  const oneOf = Array.isArray(schemaObj.oneOf) ? (schemaObj.oneOf as JSONSchemaObject[]) : null;
  if (!oneOf) return null;

  // Try to find the variant whose discriminators match the task
  for (const variant of oneOf) {
    const allOf = Array.isArray(variant.allOf) ? (variant.allOf as JSONSchemaObject[]) : [];
    let matched = false;
    let hasConst = false;
    for (const entry of allOf) {
      const props = (entry.properties ?? {}) as Record<string, JSONSchemaObject>;
      for (const [propName, propSchema] of Object.entries(props)) {
        if ("const" in propSchema) {
          hasConst = true;
          if (taskObj[propName] === propSchema.const) {
            matched = true;
          }
        }
      }
    }
    if (hasConst && matched) return variant;
  }

  // Fallback: return first variant (covers cases like CallFunction with no const)
  return oneOf[0] ?? null;
}

/**
 * Collects all scalar properties from a task schema, handling both:
 * - `allOf`-based schemas (most task types: setTask, waitTask, forTask, …)
 * - `oneOf`-based schemas (callTask, runTask, listenTask) — variant resolved via discriminator
 *
 * Always includes taskBase scalar fields (e.g. "if") from the $ref entry.
 * Excludes task-type discriminator keys and non-editable base fields.
 */
function collectScalarProperties(
  taskSchemaObj: JSONSchemaObject,
  taskObj?: Record<string, unknown>,
): Array<{ name: string; propSchema: JSONSchemaObject; required: boolean }> {
  const results: Array<{ name: string; propSchema: JSONSchemaObject; required: boolean }> = [];

  // If the schema uses oneOf, resolve to the correct variant first
  const effectiveSchema = Array.isArray(taskSchemaObj.oneOf)
    ? (resolveOneOfVariant(taskSchemaObj, taskObj ?? {}) ?? taskSchemaObj)
    : taskSchemaObj;

  // Collect required fields from all levels
  const requiredSet = new Set<string>(
    Array.isArray(effectiveSchema.required) ? (effectiveSchema.required as string[]) : [],
  );

  // Process allOf entries
  const allOf = Array.isArray(effectiveSchema.allOf)
    ? (effectiveSchema.allOf as JSONSchemaObject[])
    : [];

  for (const entry of allOf) {
    // If this entry is a $ref to taskBase, resolve it
    if (typeof entry.$ref === "string" && entry.$ref.includes("taskBase")) {
      const taskBase = getTaskBaseSchema();
      if (taskBase) {
        const baseProps = (taskBase.properties ?? {}) as Record<string, JSONSchemaObject>;
        for (const [name, propSchema] of Object.entries(baseProps)) {
          if (NON_EDITABLE_BASE_FIELDS.has(name)) continue;
          if (TASK_TYPE_KEYS.has(name)) continue;
          const type = scalarType(propSchema);
          if (!type) continue;
          results.push({ name, propSchema, required: requiredSet.has(name) });
        }
      }
      continue;
    }

    // Process properties in this allOf entry
    const props = (entry.properties ?? {}) as Record<string, JSONSchemaObject>;
    const entryRequired = Array.isArray(entry.required)
      ? new Set(entry.required as string[])
      : new Set<string>();

    for (const [name, propSchema] of Object.entries(props)) {
      if (NON_EDITABLE_BASE_FIELDS.has(name)) continue;
      if (TASK_TYPE_KEYS.has(name)) continue;
      const type = scalarType(propSchema);
      if (!type) continue;
      results.push({
        name,
        propSchema,
        required: requiredSet.has(name) || entryRequired.has(name),
      });
    }
  }

  // Also process top-level properties (non-allOf tasks)
  const topProps = (effectiveSchema.properties ?? {}) as Record<string, JSONSchemaObject>;
  for (const [name, propSchema] of Object.entries(topProps)) {
    if (results.some((r) => r.name === name)) continue; // already added
    if (NON_EDITABLE_BASE_FIELDS.has(name)) continue;
    if (TASK_TYPE_KEYS.has(name)) continue;
    const type = scalarType(propSchema);
    if (!type) continue;
    results.push({ name, propSchema, required: requiredSet.has(name) });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a $ref string (e.g. "#/$defs/externalResource") to its schema object.
 * Returns null for non-local or unresolvable refs.
 */
function resolveRef(ref: string): JSONSchemaObject | null {
  if (!ref.startsWith("#/$defs/")) return null;
  const defName = ref.slice("#/$defs/".length);
  return (schemaDefs[defName] as JSONSchemaObject | undefined) ?? null;
}

/**
 * Returns the merged properties map from a schema, handling allOf/oneOf/direct properties
 * and resolving $ref at each level. Does not recurse — returns one flat property map.
 *
 * For oneOf schemas (e.g. endpoint = runtimeExpression | uriTemplate | EndpointConfiguration),
 * properties from all variants are merged so dotted-path walking can find nested fields
 * regardless of which variant is active at runtime.
 */
function schemaProperties(schemaObj: JSONSchemaObject): Record<string, JSONSchemaObject> {
  const merged: Record<string, JSONSchemaObject> = {};

  // Resolve $ref at top level
  const resolved =
    typeof schemaObj.$ref === "string" ? (resolveRef(schemaObj.$ref) ?? schemaObj) : schemaObj;

  // Direct properties
  for (const [k, v] of Object.entries(
    (resolved.properties ?? {}) as Record<string, JSONSchemaObject>,
  )) {
    merged[k] = v;
  }

  // allOf entries
  for (const entry of Array.isArray(resolved.allOf) ? (resolved.allOf as JSONSchemaObject[]) : []) {
    const entryResolved =
      typeof entry.$ref === "string" ? (resolveRef(entry.$ref) ?? entry) : entry;
    for (const [k, v] of Object.entries(
      (entryResolved.properties ?? {}) as Record<string, JSONSchemaObject>,
    )) {
      merged[k] = v;
    }
  }

  // oneOf variants — merge properties from every variant so path-walking can reach
  // fields that live inside a specific variant (e.g. EndpointConfiguration.uri)
  for (const variant of Array.isArray(resolved.oneOf)
    ? (resolved.oneOf as JSONSchemaObject[])
    : []) {
    const variantResolved =
      typeof variant.$ref === "string" ? (resolveRef(variant.$ref) ?? variant) : variant;
    for (const [k, v] of Object.entries(
      (variantResolved.properties ?? {}) as Record<string, JSONSchemaObject>,
    )) {
      if (!(k in merged)) merged[k] = v; // first definition wins
    }
  }

  return merged;
}

/**
 * Locates the JSON Schema definition for a (possibly dotted) field path within the task sub-schema.
 * Handles both allOf-based and oneOf-based (discriminated) schemas, and walks nested objects
 * via dot-notation (e.g. "with.document.endpoint" → with → document ($ref resolved) → endpoint).
 */
function resolveFieldSchema(
  taskSchemaObj: JSONSchemaObject,
  fieldName: string,
  taskObj?: Record<string, unknown>,
): JSONSchemaObject | null {
  const segments = fieldName.split(".");

  // If schema uses oneOf, resolve the correct variant first
  const effectiveSchema = Array.isArray(taskSchemaObj.oneOf)
    ? (resolveOneOfVariant(taskSchemaObj, taskObj ?? {}) ?? taskSchemaObj)
    : taskSchemaObj;

  // Build the full property map for the task schema (allOf + direct + taskBase)
  let props: Record<string, JSONSchemaObject> = {};

  const allOf = Array.isArray(effectiveSchema.allOf)
    ? (effectiveSchema.allOf as JSONSchemaObject[])
    : [];

  for (const entry of allOf) {
    const entryResolved =
      typeof entry.$ref === "string" ? (resolveRef(entry.$ref) ?? entry) : entry;
    for (const [k, v] of Object.entries(
      (entryResolved.properties ?? {}) as Record<string, JSONSchemaObject>,
    )) {
      props[k] = v;
    }
  }

  // Direct top-level properties (non-allOf schemas)
  for (const [k, v] of Object.entries(
    (effectiveSchema.properties ?? {}) as Record<string, JSONSchemaObject>,
  )) {
    props[k] = v;
  }

  // Walk each path segment, resolving $ref and merging nested properties at each step
  let currentSchema: JSONSchemaObject | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const propEntry = props[seg];
    if (!propEntry) return null;

    // Resolve $ref on this property entry
    const resolved =
      typeof propEntry.$ref === "string" ? (resolveRef(propEntry.$ref) ?? propEntry) : propEntry;

    if (i === segments.length - 1) {
      // Last segment — return the schema for this field
      currentSchema = resolved;
    } else {
      // Intermediate segment — descend into the nested object's properties
      props = schemaProperties(resolved);
      currentSchema = resolved;
    }
  }

  return currentSchema;
}

/**
 * Builds a self-contained JSON Schema for validating a complete task object.
 * Embeds the $defs from the root workflow schema so $ref resolution works.
 * Re-uses the already-loaded schemaDefs from schemaRegistry — no duplicate import.
 */
function buildValidationSchema(
  _taskType: string,
  taskSubSchema: JSONSchemaObject,
): JSONSchemaObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schemaDefs,
    ...taskSubSchema,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns an ordered list of FieldDescriptor objects for all editable scalar fields
 * of the given task type, derived entirely from the JSON Schema.
 *
 * - taskType: the OWF task type key (e.g. "set", "wait", "for").
 * - taskObj: the actual task object (used to resolve oneOf variants for call/run/listen tasks).
 * - Returns [] for unknown task types or task types with no editable scalar fields.
 * - Never throws.
 */
export function getFieldDescriptors(
  taskType: string,
  taskObj?: Record<string, unknown>,
): FieldDescriptor[] {
  try {
    const subSchema = getSubSchema(taskType);
    if (!subSchema) return [];

    const props = collectScalarProperties(subSchema, taskObj);

    return props.map(({ name, propSchema, required }) => {
      const type = scalarType(propSchema)!;
      const label = typeof propSchema.title === "string" ? propSchema.title : camelToLabel(name);
      return {
        name,
        label,
        type,
        required,
        constraints: extractConstraints(propSchema),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Validates a complete task object against the OWF JSON Schema for its task type.
 *
 * - task: a plain object representing the task (current in-progress field values from TaskEditForm).
 * - Returns [] if valid; returns ErrorItem[] describing all violations if invalid.
 * - Returns a single descriptive ErrorItem if the task type cannot be determined or the schema is unavailable.
 * - Never throws.
 */
export function validateTask(taskType: string, task: object): ErrorItem[] {
  try {
    const subSchema = getSubSchema(taskType);
    if (!subSchema) {
      return [{ field: "unknown", message: `No schema found for task type "${taskType}".` }];
    }

    // Build a self-contained schema for this task type.
    // We need to embed the full schema's $defs so $ref resolution works.
    // Use the root schema as the source for $defs.
    const fullSchema = buildValidationSchema(taskType, subSchema);
    const validate = getValidator(taskType, fullSchema);
    const valid = validate(task);
    if (valid) return [];
    return normalizeErrors(validate.errors as ErrorObject[] | null | undefined);
  } catch {
    return [{ field: "unknown", message: "Validation could not be performed." }];
  }
}

/**
 * Validates a single scalar field value against the constraint for that field
 * in the OWF JSON Schema for the given task type.
 *
 * - taskType: OWF task type key (e.g. "set", "wait").
 * - fieldName: property name within the task (e.g. "if").
 * - value: the current scalar value to validate.
 * - taskObj: the full task object — used to resolve oneOf discriminators for call/run/listen tasks.
 * - Returns [] if valid or if no constraint is found for the field.
 * - Never throws.
 */
export function validateField(
  taskType: string,
  fieldName: string,
  value: unknown,
  taskObj?: Record<string, unknown>,
): ErrorItem[] {
  try {
    const subSchema = getSubSchema(taskType);
    if (!subSchema) return [];

    // Locate the property schema for fieldName (pass taskObj for oneOf variant resolution).
    const propSchema = resolveFieldSchema(subSchema, fieldName, taskObj);
    if (!propSchema) return [];

    // Embed $defs so $ref chains within the field schema resolve correctly (e.g. endpoint → uriTemplate).
    const fullFieldSchema: JSONSchemaObject = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: schemaDefs,
      ...propSchema,
    };

    // Cache key includes discriminator to avoid reusing wrong compiled validator for oneOf types
    const discriminator = taskObj
      ? JSON.stringify(
          Object.entries(taskObj)
            .filter(([, v]) => typeof v === "string" || typeof v === "number")
            .slice(0, 3),
        )
      : "";
    const cacheKey = `${taskType}:${fieldName}:${discriminator}`;
    const validate = getValidator(cacheKey, fullFieldSchema);
    const valid = validate(value);
    if (valid) return [];
    return normalizeErrors(validate.errors as ErrorObject[] | null | undefined, fieldName);
  } catch {
    return [];
  }
}

/**
 * Validates a complete workflow object against the root OWF JSON Schema.
 *
 * - workflow: a plain object representing the full workflow definition.
 * - Returns [] if valid; returns ErrorItem[] describing all violations if invalid.
 * - Returns a single descriptive ErrorItem if validation cannot be performed.
 * - Never throws.
 *
 * Errors are returned in the same ErrorItem format as validateTask and validateField:
 *   { field: string, message: string }
 * where `field` is the dotted JSON pointer path to the violating property
 * (e.g. "document.dsl", "do[0].set") or "unknown" for schema-level errors.
 */
export function validate(workflow: object): ErrorItem[] {
  try {
    const validator = getValidator("__workflow__", rootWorkflowSchema);
    const valid = validator(workflow);
    if (valid) return [];
    return normalizeErrors(validator.errors as ErrorObject[] | null | undefined, undefined, true);
  } catch {
    return [{ field: "unknown", message: "Workflow validation could not be performed." }];
  }
}
