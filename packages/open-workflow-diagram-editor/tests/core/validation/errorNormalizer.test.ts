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

import { describe, it, expect } from "vitest";
import type { ErrorObject } from "ajv";
import { normalizeErrors } from "../../../src/core/validation/errorNormalizer";

/** Minimal helper to build an AJV-style ErrorObject. */
function makeError(
  keyword: string,
  instancePath: string,
  params: Record<string, unknown> = {},
  message?: string,
): ErrorObject {
  return {
    keyword,
    instancePath,
    schemaPath: `#/${keyword}`,
    params,
    message,
  } as unknown as ErrorObject;
}

describe("normalizeErrors", () => {
  it("returns [] for null input", () => {
    expect(normalizeErrors(null)).toEqual([]);
  });

  it("returns [] for undefined input", () => {
    expect(normalizeErrors(undefined)).toEqual([]);
  });

  it("returns [] for empty array input", () => {
    expect(normalizeErrors([])).toEqual([]);
  });

  it("maps a 'type' error to a human message", () => {
    const result = normalizeErrors([makeError("type", "/name", { type: "string" })]);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toBe("Must be of type string.");
    expect(result[0]!.field).toBe("name");
  });

  it("maps a 'minLength' error", () => {
    const result = normalizeErrors([makeError("minLength", "/name", { limit: 3 })]);
    expect(result[0]!.message).toBe("Must be at least 3 characters long.");
  });

  it("maps a 'maxLength' error", () => {
    const result = normalizeErrors([makeError("maxLength", "/name", { limit: 10 })]);
    expect(result[0]!.message).toBe("Must be at most 10 characters long.");
  });

  it("maps a 'minimum' error", () => {
    const result = normalizeErrors([makeError("minimum", "/count", { limit: 1 })]);
    expect(result[0]!.message).toBe("Must be greater than or equal to 1.");
  });

  it("maps a 'maximum' error", () => {
    const result = normalizeErrors([makeError("maximum", "/count", { limit: 100 })]);
    expect(result[0]!.message).toBe("Must be less than or equal to 100.");
  });

  it("maps a 'pattern' error", () => {
    const result = normalizeErrors([makeError("pattern", "/code", { pattern: "^[A-Z]+$" })]);
    expect(result[0]!.message).toBe("Must match the pattern: ^[A-Z]+$.");
  });

  it("maps an 'enum' error", () => {
    const result = normalizeErrors([
      makeError("enum", "/status", { allowedValues: ["pending", "done"] }),
    ]);
    expect(result[0]!.message).toBe("Must be one of: pending, done.");
  });

  it("maps a 'required' error using missingProperty param", () => {
    const result = normalizeErrors([makeError("required", "", { missingProperty: "endpoint" })]);
    expect(result[0]!.message).toBe('Required field "endpoint" is missing.');
    expect(result[0]!.field).toBe("unknown");
  });

  it("maps an 'unevaluatedProperties' error", () => {
    const result = normalizeErrors([makeError("unevaluatedProperties", "/extra", {})]);
    expect(result[0]!.message).toBe("Contains unexpected properties.");
  });

  it("maps a 'const' error", () => {
    const result = normalizeErrors([makeError("const", "/type", { allowedValue: "http" })]);
    expect(result[0]!.message).toBe('Must equal "http".');
  });

  it("falls back to the raw error message for unknown keywords", () => {
    const result = normalizeErrors([makeError("custom", "/field", {}, "some custom error")]);
    expect(result[0]!.message).toBe("some custom error");
  });

  it("falls back to keyword description when message is missing for unknown keyword", () => {
    const result = normalizeErrors([makeError("custom", "/field", {})]);
    expect(result[0]!.message).toBe("Validation failed (custom).");
  });

  it("uses fieldOverride when provided instead of instancePath", () => {
    const result = normalizeErrors(
      [makeError("type", "/something/deep", { type: "number" })],
      "myField",
    );
    expect(result[0]!.field).toBe("myField");
  });

  it("converts a multi-segment instancePath to dot-notation (e.g. /a/b/leaf → a.b.leaf)", () => {
    const result = normalizeErrors([makeError("type", "/a/b/leaf", { type: "boolean" })]);
    expect(result[0]!.field).toBe("a.b.leaf");
  });

  it("deduplicates errors with the same field:message pair (from oneOf repetition)", () => {
    const sameError = makeError("required", "", { missingProperty: "endpoint" });
    // Same error reported 3 times (once per oneOf variant)
    const result = normalizeErrors([sameError, sameError, sameError]);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toBe('Required field "endpoint" is missing.');
  });

  it("keeps distinct errors with different messages", () => {
    const errors = [
      makeError("required", "", { missingProperty: "endpoint" }),
      makeError("required", "", { missingProperty: "method" }),
    ];
    const result = normalizeErrors(errors);
    expect(result).toHaveLength(2);
  });

  it("maps a 'minLength' error with limit 1 (singular 'character')", () => {
    const result = normalizeErrors([makeError("minLength", "/x", { limit: 1 })]);
    expect(result[0]!.message).toBe("Must be at least 1 character long.");
  });
});
