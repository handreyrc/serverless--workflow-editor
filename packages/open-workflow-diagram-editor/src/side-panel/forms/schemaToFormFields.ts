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

import type { DereferencedSchema } from "@/core/schemaFilter";

/**
 * A single form field descriptor produced by walking a task's JSON Schema.
 * Each descriptor drives one row in the form UI.
 *
 * The walker is fully generic — it understands JSON Schema structure but
 * carries no knowledge of any specific schema definition names or task types.
 * Domain-specific concerns (e.g. mapping graph node types to definition names)
 * live in `src/core/schemaWalker.ts`.
 */
export type FormFieldDescriptor =
  | StringField
  | NumberField
  | BooleanField
  | EnumField
  | DurationField
  | ThenField
  | ChildTaskListField
  | ObjectField
  | OneOfField;

interface FieldBase {
  /** Dot-notation path from the task root, e.g. "for.each" */
  path: string;
  /** Human-readable label (title from schema, or the last path segment) */
  label: string;
  /** Schema description shown as a tooltip when present */
  description?: string | undefined;
  /** Whether the field must have a value (required in schema) */
  required: boolean;
}

export interface StringField extends FieldBase {
  kind: "string";
  /** When true the field uses a Textarea rather than an Input */
  multiline: boolean;
  /** The runtime-expression pattern — field value must match `${...}` syntax */
  isRuntimeExpression: boolean;
}

export interface NumberField extends FieldBase {
  kind: "number";
}

export interface BooleanField extends FieldBase {
  kind: "boolean";
}

export interface EnumField extends FieldBase {
  kind: "enum";
  options: string[];
}

/**
 * An ISO-8601 duration string field.
 * Identified structurally: a string property whose `pattern` starts with `^P`.
 */
export interface DurationField extends FieldBase {
  kind: "duration";
}

/**
 * The `then` transition field — a combobox driven by sibling task names
 * in the workflow. Identified structurally: any property named `then`, or
 * any property whose schema is an `anyOf` containing an enum variant and a
 * plain-string variant (the flowDirective pattern).
 */
export interface ThenField extends FieldBase {
  kind: "then";
}

/**
 * A property that resolves to an array of tagged task entries.
 * Rendered as a read-only list of child-task names.
 *
 * Identified structurally: an array whose `items.additionalProperties.$ref`
 * points to the task union definition.
 */
export interface ChildTaskListField extends FieldBase {
  kind: "child-task-list";
}

/**
 * A plain object with known sub-properties.
 * Rendered as a collapsible group that recurses into its children.
 */
export interface ObjectField extends FieldBase {
  kind: "object";
  children: FormFieldDescriptor[];
}

/**
 * A field that can hold one of several variant types (oneOf / anyOf in the
 * schema). Each variant is a sub-schema with its own label and child fields.
 */
export interface OneOfField extends FieldBase {
  kind: "one-of";
  variants: OneOfVariant[];
}

export interface OneOfVariant {
  /** Label for the variant (from schema `title`, or a generated fallback) */
  label: string;
  /** The fields that belong to this variant */
  fields: FormFieldDescriptor[];
  /**
   * Discriminator predicate: given the actual task value at this field's path,
   * returns true when this variant is the one that matches the current data.
   * Used in read-only mode to auto-select the correct variant.
   */
  matchesData: (data: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUNTIME_EXPRESSION_PATTERN = /^\s*\$\{.+\}\s*$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Resolve a `$ref` string like `"#/$defs/taskList"` against the local `$defs` block. */
function resolveRef(
  ref: string,
  defs: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!ref.startsWith("#/$defs/") || !defs) return null;
  const name = ref.slice("#/$defs/".length);
  const def = defs[name];
  return isPlainObject(def) ? def : null;
}

/**
 * Returns true if the schema node (or any `$ref` it resolves to) represents
 * a task-list — an array whose `items.additionalProperties.$ref` points to
 * the task union. Detection is purely structural; no definition name is
 * hardcoded beyond the conventional task-union ref pattern.
 */
function isTaskListSchema(
  schema: Record<string, unknown>,
  defs: Record<string, unknown> | undefined,
): boolean {
  let node: Record<string, unknown> = schema;

  // Follow one level of $ref
  if (typeof node.$ref === "string") {
    const resolved = resolveRef(node.$ref, defs);
    if (!resolved) return false;
    node = resolved;
  }

  if (node.type !== "array") return false;
  const items = node.items;
  if (!isPlainObject(items)) return false;
  const ap = (items as Record<string, unknown>).additionalProperties;
  if (!isPlainObject(ap)) return false;
  const apRef = ap.$ref;
  // Matches any ref whose last path segment is "task" (e.g. "#/$defs/task")
  return typeof apRef === "string" && (apRef === "#/$defs/task" || apRef.endsWith("/task"));
}

/**
 * Returns true if the schema represents a flow-directive field — a combobox
 * that combines a set of named flow directives with a free-text task reference.
 *
 * Detection is structural: an `anyOf` that contains at least one variant with
 * an `enum` array and at least one plain-string variant (no enum). This
 * matches the `flowDirective` definition without referring to its name.
 */
function isFlowDirectiveSchema(
  schema: Record<string, unknown>,
  defs: Record<string, unknown> | undefined,
): boolean {
  // Recurse through a single level of $ref first
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, defs);
    if (resolved) return isFlowDirectiveSchema(resolved, defs);
  }

  if (!Array.isArray(schema.anyOf)) return false;
  const anyOf = schema.anyOf as unknown[];

  const hasEnum = anyOf.some(
    (v) => isPlainObject(v) && Array.isArray((v as Record<string, unknown>).enum),
  );
  const hasPlainString = anyOf.some(
    (v) =>
      isPlainObject(v) &&
      (v as Record<string, unknown>).type === "string" &&
      !Array.isArray((v as Record<string, unknown>).enum),
  );
  return hasEnum && hasPlainString;
}

/** Derive a human-readable label from a schema node and the property key. */
function deriveLabel(schema: Record<string, unknown>, key: string): string {
  if (typeof schema.title === "string") {
    // Strip any CamelCase prefix from composite titles like "ForTaskDo" → "Do"
    const words = schema.title
      .replace(/([A-Z])/g, " $1")
      .trim()
      .split(" ");
    return words[words.length - 1] ?? key;
  }
  return key;
}

/** Only include the `description` key when it has a value (exactOptionalPropertyTypes). */
function withDesc(description: string | undefined): { description?: string } {
  return description !== undefined ? { description } : {};
}

// ---------------------------------------------------------------------------
// Core walker
// ---------------------------------------------------------------------------

/**
 * Walks a resolved JSON Schema and produces an ordered list of
 * `FormFieldDescriptor`s that drive the task form UI.
 *
 * The walker understands JSON Schema structure (properties, oneOf, anyOf,
 * $ref, type) and maps schema shapes to form field kinds. It is intentionally
 * schema-agnostic: no specific definition names are referenced, so it works
 * with any conforming JSON Schema regardless of which workflow DSL version
 * produced it.
 *
 * @param schema     - The merged schema node (a `properties` block owner).
 * @param defs       - The `$defs` bundle accompanying the top-level schema.
 * @param requiredSet - Set of required property names at this level.
 * @param path       - Dot-notation prefix (empty string at root).
 */
export function schemaToFormFields(
  schema: DereferencedSchema,
  defs?: Record<string, unknown>,
  requiredSet?: Set<string>,
  path = "",
): FormFieldDescriptor[] {
  const fields: FormFieldDescriptor[] = [];

  // Tasks like callTask have a top-level `oneOf` with no own `properties`.
  if (Array.isArray(schema.oneOf) && !schema.properties) {
    const variants = buildOneOfVariants(schema.oneOf as unknown[], defs, path);
    if (variants.length > 0) {
      fields.push({
        kind: "one-of",
        path: path || "__root__",
        label: typeof schema.title === "string" ? schema.title : "Type",
        ...withDesc(typeof schema.description === "string" ? schema.description : undefined),
        required: false,
        variants,
      });
    }
    return fields;
  }

  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return fields;

  const localDefs = (schema.$defs as Record<string, unknown> | undefined) ?? defs;
  const req =
    requiredSet ??
    new Set<string>(Array.isArray(schema.required) ? (schema.required as string[]) : []);

  for (const [key, rawProp] of Object.entries(properties)) {
    if (!isPlainObject(rawProp)) continue;

    // Skip metadata — free-form object, not useful to render as a form field
    if (key === "metadata") continue;

    const prop = rawProp as Record<string, unknown>;
    const fieldPath = path ? `${path}.${key}` : key;
    const isRequired = req.has(key);
    const description = typeof prop.description === "string" ? prop.description : undefined;

    // ── Special case: `then` key or flow-directive schema ─────────────────
    // The `then` property is the canonical transition field and is always
    // rendered as a sibling-task selector, regardless of its schema shape.
    // Any other property whose schema structurally matches the flow-directive
    // pattern (anyOf enum + plain string) is also treated as a `then` field.
    if (key === "then" || isFlowDirectiveSchema(prop, localDefs)) {
      fields.push({
        kind: "then",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
      });
      continue;
    }

    // ── Resolve $ref ───────────────────────────────────────────────────────
    let resolved: Record<string, unknown> = prop;
    if (typeof prop.$ref === "string") {
      const ref = resolveRef(prop.$ref, localDefs);
      if (ref) {
        resolved = { ...ref, ...prop, $ref: undefined };
      }
    }

    // ── Child task list ────────────────────────────────────────────────────
    if (isTaskListSchema(resolved, localDefs)) {
      fields.push({
        kind: "child-task-list",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
      });
      continue;
    }

    // ── oneOf / anyOf at property level ────────────────────────────────────
    const candidates = (resolved.oneOf ?? resolved.anyOf) as unknown[] | undefined;
    if (Array.isArray(candidates)) {
      const variants = buildOneOfVariants(candidates, localDefs, fieldPath);
      if (variants.length > 0) {
        fields.push({
          kind: "one-of",
          path: fieldPath,
          label: deriveLabel(prop, key),
          ...withDesc(description),
          required: isRequired,
          variants,
        });
        continue;
      }
    }

    // ── Object with known sub-properties ───────────────────────────────────
    if (resolved.type === "object" && resolved.properties) {
      const childRequired = new Set<string>(
        Array.isArray(resolved.required) ? (resolved.required as string[]) : [],
      );
      const children = schemaToFormFields(
        resolved as DereferencedSchema,
        localDefs,
        childRequired,
        fieldPath,
      );
      fields.push({
        kind: "object",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
        children,
      });
      continue;
    }

    // ── Boolean ────────────────────────────────────────────────────────────
    if (resolved.type === "boolean") {
      fields.push({
        kind: "boolean",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
      });
      continue;
    }

    // ── Enum (string with enum array) ──────────────────────────────────────
    if (resolved.type === "string" && Array.isArray(resolved.enum)) {
      fields.push({
        kind: "enum",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
        options: resolved.enum as string[],
      });
      continue;
    }

    // ── Duration (string whose pattern describes an ISO 8601 duration) ─────
    if (
      resolved.type === "string" &&
      typeof resolved.pattern === "string" &&
      resolved.pattern.startsWith("^P")
    ) {
      fields.push({
        kind: "duration",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
      });
      continue;
    }

    // ── Number / integer ───────────────────────────────────────────────────
    if (resolved.type === "number" || resolved.type === "integer") {
      fields.push({
        kind: "number",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
      });
      continue;
    }

    // ── String ─────────────────────────────────────────────────────────────
    if (resolved.type === "string") {
      const isRe = RUNTIME_EXPRESSION_PATTERN.test(String(resolved.pattern ?? ""));
      // Multi-line heuristic: keys that conventionally hold large text blocks
      const multiline = key === "command" || key === "code" || key === "script";
      fields.push({
        kind: "string",
        path: fieldPath,
        label: deriveLabel(prop, key),
        ...withDesc(description),
        required: isRequired,
        multiline,
        isRuntimeExpression: isRe,
      });
      continue;
    }

    // ── Fallback: treat as free-form string ────────────────────────────────
    fields.push({
      kind: "string",
      path: fieldPath,
      label: deriveLabel(prop, key),
      ...withDesc(description),
      required: isRequired,
      multiline: false,
      isRuntimeExpression: false,
    });
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Discriminator helpers
// ---------------------------------------------------------------------------

/**
 * Builds a `matchesData` predicate for a resolved schema variant.
 *
 * Strategy (in order):
 * 1. Property with `const` value → data must have that property equal to the
 *    const (e.g. `call: { const: "http" }`).
 * 2. Single unique required property → data must have that key present.
 * 3. Scalar type → check `typeof data`.
 * 4. Object type (no const discriminator) → data must be a non-array object.
 * 5. Fallback → always returns false (last variant wins at the call site).
 */
function buildDiscriminator(
  resolved: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _defs: Record<string, unknown> | undefined,
): (data: unknown) => boolean {
  const properties = resolved.properties as Record<string, unknown> | undefined;

  // Strategy 1: property with `const`
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      if (isPlainObject(propSchema)) {
        const constVal = (propSchema as Record<string, unknown>).const;
        if (constVal !== undefined) {
          return (data: unknown) =>
            isPlainObject(data) && (data as Record<string, unknown>)[key] === constVal;
        }
      }
    }
  }

  // Strategy 2: single unique required property key
  if (properties) {
    const ownKeys = Object.keys(properties);
    const required = Array.isArray(resolved.required) ? (resolved.required as string[]) : [];
    if (ownKeys.length === 1 && required.includes(ownKeys[0]!)) {
      const uniqueKey = ownKeys[0]!;
      return (data: unknown) =>
        isPlainObject(data) && (data as Record<string, unknown>)[uniqueKey] !== undefined;
    }
  }

  // Strategy 3: scalar type
  if (resolved.type === "string" || Array.isArray(resolved.anyOf)) {
    return (data: unknown) => typeof data === "string";
  }
  if (resolved.type === "number" || resolved.type === "integer") {
    return (data: unknown) => typeof data === "number";
  }
  if (resolved.type === "boolean") {
    return (data: unknown) => typeof data === "boolean";
  }

  // Strategy 4: object type
  if (resolved.type === "object" || properties) {
    return (data: unknown) => isPlainObject(data) && !Array.isArray(data);
  }

  // Fallback
  return () => false;
}

// ---------------------------------------------------------------------------

function buildOneOfVariants(
  candidates: unknown[],
  defs: Record<string, unknown> | undefined,
  parentPath: string,
): OneOfVariant[] {
  return candidates.flatMap((candidate, idx) => {
    if (!isPlainObject(candidate)) return [];
    const c = candidate as Record<string, unknown>;

    let resolved: Record<string, unknown> = c;
    if (typeof c.$ref === "string") {
      const ref = resolveRef(c.$ref, defs);
      if (ref) resolved = { ...ref, ...c, $ref: undefined };
    }

    const matchesData = buildDiscriminator(resolved, defs);

    // Pure scalar variants (e.g. {type:"string"} or {type:"string", enum:[...]})
    // Synthesise a leaf FormFieldDescriptor so the variant renders a real control.
    if (!resolved.properties && !Array.isArray(resolved.oneOf)) {
      const label =
        typeof c.title === "string"
          ? c.title
          : typeof resolved.type === "string"
            ? resolved.type
            : `Option ${idx + 1}`;

      const leafPath = parentPath || "__leaf__";
      let leafField: FormFieldDescriptor;

      if (resolved.type === "string" && Array.isArray(resolved.enum)) {
        leafField = {
          kind: "enum",
          path: leafPath,
          label,
          required: false,
          options: resolved.enum as string[],
        };
      } else if (resolved.type === "number" || resolved.type === "integer") {
        leafField = { kind: "number", path: leafPath, label, required: false };
      } else if (resolved.type === "boolean") {
        leafField = { kind: "boolean", path: leafPath, label, required: false };
      } else {
        // plain string (or unrecognised scalar)
        leafField = {
          kind: "string",
          path: leafPath,
          label,
          required: false,
          multiline: false,
          isRuntimeExpression: false,
        };
      }

      return [{ label, matchesData, fields: [leafField] }];
    }

    const req = new Set<string>(
      Array.isArray(resolved.required) ? (resolved.required as string[]) : [],
    );
    const children = schemaToFormFields(resolved as DereferencedSchema, defs, req, parentPath);

    const label =
      typeof c.title === "string"
        ? c.title
        : typeof resolved.title === "string"
          ? resolved.title
          : `Option ${idx + 1}`;

    return [{ label, matchesData, fields: children }];
  });
}
