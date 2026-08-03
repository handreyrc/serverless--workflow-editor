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
 * errorNormalizer — maps ajv validation errors to the ErrorItem shape used by ErrorSection.
 *
 * This is the only file in the validation core that is aware of ajv's error shape.
 * All other validation core modules call through this normaliser.
 *
 * No React, no SDK, no store, no DOM dependency.
 */

import type { ErrorObject } from "ajv";

/** Minimal ErrorItem matching the existing shape in ErrorsSection.tsx. */
export type ErrorItem = {
  message: string;
  field?: string;
};

/**
 * Converts an AJV instancePath to a dot-notation field key (e.g. "/with/document/endpoint" → "with.document.endpoint").
 * Used as the errorMap key so it matches the dot-notation paths used by fieldValues and the form inputs.
 * Falls back to "unknown" for empty or root-only paths.
 */
function fieldFromInstancePath(instancePath: string, fieldOverride?: string): string {
  if (fieldOverride) return fieldOverride;
  if (!instancePath || instancePath === "/") return "unknown";
  const segments = instancePath.split("/").filter(Boolean);
  if (segments.length === 0) return "unknown";
  return segments.join(".");
}

/**
 * Converts an AJV instancePath to a slash-notation node path compatible with the SDK flat-graph node IDs.
 *
 * AJV paths include numeric array indices for items inside arrays (e.g. "/do/0/taskName"),
 * while SDK node IDs omit those indices (e.g. "/do/taskName"). Stripping the numeric
 * segments makes the path match node IDs so that findOwningNode can correlate errors to nodes.
 *
 * Falls back to "unknown" for empty paths.
 */
function nodePathFromInstancePath(instancePath: string): string {
  if (!instancePath) return "unknown";
  const segments = instancePath.split("/").filter((s) => s !== "" && !/^\d+$/.test(s));
  if (segments.length === 0) return "unknown";
  return "/" + segments.join("/");
}

/**
 * Converts an AJV `keyword` + associated params to a plain-English message.
 */
function humanMessage(error: ErrorObject): string {
  const { keyword, params } = error;
  switch (keyword) {
    case "type": {
      const expected = (params as { type?: string }).type ?? "unknown";
      return `Must be of type ${expected}.`;
    }
    case "minLength": {
      const min = (params as { limit?: number }).limit ?? 0;
      return `Must be at least ${min} character${min === 1 ? "" : "s"} long.`;
    }
    case "maxLength": {
      const max = (params as { limit?: number }).limit ?? 0;
      return `Must be at most ${max} character${max === 1 ? "" : "s"} long.`;
    }
    case "minimum": {
      const min = (params as { limit?: number }).limit ?? 0;
      return `Must be greater than or equal to ${min}.`;
    }
    case "maximum": {
      const max = (params as { limit?: number }).limit ?? 0;
      return `Must be less than or equal to ${max}.`;
    }
    case "exclusiveMinimum": {
      const min = (params as { limit?: number }).limit ?? 0;
      return `Must be greater than ${min}.`;
    }
    case "exclusiveMaximum": {
      const max = (params as { limit?: number }).limit ?? 0;
      return `Must be less than ${max}.`;
    }
    case "pattern": {
      const pat = (params as { pattern?: string }).pattern ?? "";
      return `Must match the pattern: ${pat}.`;
    }
    case "enum": {
      const allowed = (params as { allowedValues?: unknown[] }).allowedValues ?? [];
      return `Must be one of: ${allowed.map(String).join(", ")}.`;
    }
    case "required": {
      const missing = (params as { missingProperty?: string }).missingProperty ?? "";
      return `Required field "${missing}" is missing.`;
    }
    case "unevaluatedProperties": {
      return "Contains unexpected properties.";
    }
    case "const": {
      const expected = (params as { allowedValue?: unknown }).allowedValue;
      return `Must equal ${JSON.stringify(expected)}.`;
    }
    default:
      return error.message ?? `Validation failed (${keyword}).`;
  }
}

/**
 * Normalises AJV ErrorObject[] to ErrorItem[].
 *
 * Rules:
 * - instancePath is used to derive the field name (leaf segment).
 * - Keywords are translated to plain-English messages.
 * - If an error cannot be mapped, a fallback { field: "unknown", message } is produced.
 * - Empty or undefined input returns [].
 * - Never throws.
 */
export function normalizeErrors(
  rawErrors: ErrorObject[] | null | undefined,
  fieldOverride?: string,
  preservePath?: boolean,
): ErrorItem[] {
  if (!rawErrors || rawErrors.length === 0) return [];

  const seen = new Set<string>();
  const result: ErrorItem[] = [];
  for (const error of rawErrors) {
    try {
      const field = preservePath
        ? nodePathFromInstancePath(error.instancePath)
        : fieldFromInstancePath(error.instancePath, fieldOverride);
      const message = humanMessage(error);
      const key = `${field}:${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ field, message });
    } catch {
      result.push({ field: "unknown", message: "Validation error." });
    }
  }
  return result;
}
