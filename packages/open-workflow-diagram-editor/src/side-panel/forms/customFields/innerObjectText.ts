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

import { dump, load } from "js-yaml";
import type { ContentFormat, EnumField } from "../../../core/schemaToFormFields";
import { getNestedValue } from "../taskFormContext";
import { innerTextPath } from "../sentinels";

// ---------------------------------------------------------------------------
// Value-map enum inner objects (e.g. `backoff: { exponential: {...} }`).
// ---------------------------------------------------------------------------

/** Extracts the inner object payload, or `{}` if none. */
export function deriveInnerObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const key = Object.keys(obj)[0];
    if (key !== undefined) {
      const inner = obj[key];
      return inner !== null && typeof inner === "object" && !Array.isArray(inner)
        ? (inner as Record<string, unknown>)
        : {};
    }
  }
  return {};
}

export function serializeInnerObject(obj: Record<string, unknown>, format: ContentFormat): string {
  if (Object.keys(obj).length === 0) return "";
  try {
    return format === "json"
      ? JSON.stringify(obj, null, 2)
      : dump(obj, { indent: 2, lineWidth: -1 }).trimEnd();
  } catch {
    return "";
  }
}

/**
 * Parses inner-object text: `{}` for empty text (an intentional empty payload), the object
 * when it parses to a plain object, and `null` when it does not parse or is not a plain object
 * (malformed text, a bare scalar, an array). Callers must not commit a `null` result.
 */
export function parseInnerObject(
  text: string | undefined,
  format: ContentFormat,
): Record<string, unknown> | null {
  if (!text || text.trim() === "") return {};
  try {
    const parsed = format === "json" ? JSON.parse(text) : (load(text) as unknown);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The inner object payload for a value-map enum's selected `key`, parsed from the text the
 * form `values` hold for it. `{}` when no key is selected or the field has no inner object,
 * `null` when the text does not parse.
 */
export function getValueMapInnerObject(
  field: EnumField,
  key: string,
  values: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!key || field.innerObjectFormat === undefined) return {};
  const text = getNestedValue(values, innerTextPath(field.path));
  return parseInnerObject(typeof text === "string" ? text : undefined, field.innerObjectFormat);
}
