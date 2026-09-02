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

import { get } from "react-hook-form";
import type { Resolver, FieldErrors, FieldError } from "react-hook-form";
import type { FormFieldDescriptor } from "@/side-panel/forms/schemaToFormFields";

// ---------------------------------------------------------------------------
// ISO-8601 duration pattern (same as DurationControl)
// ---------------------------------------------------------------------------

const ISO_8601_DURATION_RE =
  /^P(?!$)(\d+(?:\.\d+)?Y)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?W)?(\d+(?:\.\d+)?D)?(T(?=\d)(\d+(?:\.\d+)?H)?(\d+(?:\.\d+)?M)?(\d+(?:\.\d+)?S)?)?$/;

// ---------------------------------------------------------------------------
// Leaf validator
// ---------------------------------------------------------------------------

/**
 * Validates a single flattened form value against its field descriptor.
 * Returns an error message string when invalid, or `undefined` when valid.
 */
function validateLeaf(field: FormFieldDescriptor, value: unknown): string | undefined {
  // child-task-list and object/one-of containers are never directly validated
  if (field.kind === "child-task-list" || field.kind === "object" || field.kind === "one-of") {
    return undefined;
  }

  const isEmpty =
    value === undefined || value === null || (typeof value === "string" && value.trim() === "");

  if (field.required && isEmpty) {
    return `${field.label} is required`;
  }

  if (isEmpty) return undefined;

  switch (field.kind) {
    case "number": {
      if (typeof value !== "number" && (typeof value !== "string" || isNaN(Number(value)))) {
        return `${field.label} must be a number`;
      }
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return `${field.label} must be a boolean`;
      }
      break;
    }
    case "enum": {
      if (typeof value === "string" && !field.options.includes(value)) {
        return `${field.label} must be one of: ${field.options.join(", ")}`;
      }
      break;
    }
    case "duration": {
      if (typeof value === "string" && !ISO_8601_DURATION_RE.test(value)) {
        return `${field.label} must be a valid ISO 8601 duration (e.g. PT30S)`;
      }
      break;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Flat field collector (values-aware)
// ---------------------------------------------------------------------------

/**
 * Recursively collects leaf `FormFieldDescriptor`s from a field tree,
 * using `values` to select only the **active** variant at each `one-of` node.
 *
 * A `one-of` represents mutually exclusive schemas — validating leaves from
 * all variants simultaneously would fire errors for fields that belong to
 * inactive variants (e.g. the MCP `arguments.method` enum firing on an HTTP
 * task where that path is absent).
 *
 * For the root-level `one-of` (`path === "__root__"`) the discriminator is
 * applied against the whole flat `values` object.  For property-level
 * `one-of`s it is applied against the value at `field.path`.
 */
function collectLeafFields(
  fields: FormFieldDescriptor[],
  values: Record<string, unknown>,
): FormFieldDescriptor[] {
  const leaves: FormFieldDescriptor[] = [];
  for (const field of fields) {
    if (field.kind === "object") {
      leaves.push(...collectLeafFields(field.children, values));
    } else if (field.kind === "one-of") {
      // Determine what data to discriminate against.
      // Use RHF's get() to read nested values correctly (see value-reading note below).
      const dataAtPath =
        field.path === "__root__"
          ? values
          : (get(values, field.path) as Record<string, unknown> | undefined);

      // Find the first variant whose matchesData predicate passes.
      const activeVariant =
        field.variants.find((v) => v.matchesData(dataAtPath)) ?? field.variants[0];

      if (activeVariant !== undefined) {
        leaves.push(...collectLeafFields(activeVariant.fields, values));
      }
    } else {
      leaves.push(field);
    }
  }
  return leaves;
}

// ---------------------------------------------------------------------------
// Public: buildTaskFormResolver
// ---------------------------------------------------------------------------

/**
 * Builds a react-hook-form `Resolver` that validates form values against the
 * ordered list of `FormFieldDescriptor`s produced by the schema walker.
 *
 * Validation is intentionally minimal — it covers only the constraints that
 * the schema walker exposes through `FormFieldDescriptor`:
 *
 * - Required check for every leaf field (string / number / boolean / enum /
 *   duration / then).
 * - Type correctness for number and boolean fields.
 * - Enum membership for enum fields.
 * - ISO 8601 pattern for duration fields.
 *
 * The resolver runs synchronously and uses `criteriaMode: "all"` if you want
 * all errors reported at once, but it works correctly in the default
 * `criteriaMode: "firstError"` mode too.
 *
 * @param fields - The full list of `FormFieldDescriptor`s for the current
 *                 node type, as returned by `getFormFieldsForNodeType`.
 */
export function buildTaskFormResolver(
  fields: FormFieldDescriptor[],
): Resolver<Record<string, unknown>> {
  return (values) => {
    // Collect leaves on every validation run so the active one-of variant is
    // re-evaluated against the current values rather than fixed at build time.
    const leaves = collectLeafFields(fields, values);
    const errors: FieldErrors<Record<string, unknown>> = {};

    for (const field of leaves) {
      // RHF stores form values as a nested object tree even when field names
      // use dot-notation (e.g. "with.method" lives at values.with.method after
      // the first onChange/register cycle, not at values["with.method"]).
      // Use RHF's own `get()` helper so we always read the current live value.
      const value = get(values, field.path) as unknown;
      const message = validateLeaf(field, value);
      if (message !== undefined) {
        errors[field.path] = {
          type: "schema",
          message,
        } satisfies FieldError;
      }
    }

    if (Object.keys(errors).length > 0) {
      return { values: {}, errors };
    }

    return { values, errors: {} };
  };
}
