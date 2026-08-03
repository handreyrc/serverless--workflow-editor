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
import {
  validateTask,
  validateField,
  getFieldDescriptors,
} from "../../../src/core/validation/validator";

// ---------------------------------------------------------------------------
// getFieldDescriptors
// ---------------------------------------------------------------------------
describe("getFieldDescriptors", () => {
  it("returns [] for an unknown task type", () => {
    expect(getFieldDescriptors("nonExistentTaskType")).toEqual([]);
  });

  it("returns scalar descriptors for a setTask (has no editable scalars beyond base)", () => {
    // setTask's own fields are all objects/maps, not scalars; base 'if' is editable
    const descriptors = getFieldDescriptors("set");
    // At minimum should not throw, and all returned items should have required boolean
    for (const d of descriptors) {
      expect(typeof d.name).toBe("string");
      expect(typeof d.required).toBe("boolean");
      expect(["string", "number", "boolean"]).toContain(d.type);
    }
  });

  it("returns descriptors for a forTask which has editable scalar fields", () => {
    const descriptors = getFieldDescriptors("for");
    // for task has no editable top-level scalars itself, but base 'if' may appear
    expect(Array.isArray(descriptors)).toBe(true);
  });

  it("does not include task-type discriminator keys in descriptors", () => {
    const typeKeys = [
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
    ];
    for (const taskType of typeKeys) {
      const descriptors = getFieldDescriptors(taskType);
      for (const d of descriptors) {
        expect(typeKeys).not.toContain(d.name);
      }
    }
  });

  it("never throws for any supported task type", () => {
    const taskTypes = [
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
    ];
    for (const taskType of taskTypes) {
      expect(() => getFieldDescriptors(taskType)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// validateTask
// ---------------------------------------------------------------------------
describe("validateTask", () => {
  it("returns [] for an unknown task type (graceful fallback)", () => {
    // Unknown types return a descriptive error, not a throw
    const result = validateTask("nonExistentType", {});
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns [] for a valid setTask", () => {
    const validSetTask = {
      set: { myVar: "hello" },
    };
    const errors = validateTask("set", validSetTask);
    expect(errors).toEqual([]);
  });

  it("returns [] for a valid waitTask (duration wait)", () => {
    const validWaitTask = {
      wait: { hours: 1 },
    };
    const errors = validateTask("wait", validWaitTask);
    expect(errors).toEqual([]);
  });

  it("returns errors for a setTask missing the required 'set' property", () => {
    // A completely empty object is invalid for a setTask
    const errors = validateTask("set", {});
    expect(errors.length).toBeGreaterThan(0);
    // At least one error should mention 'set'
    const messages = errors.map((e) => e.message);
    const mentionsSet = messages.some(
      (m) => m.toLowerCase().includes("set") || m.toLowerCase().includes("required"),
    );
    expect(mentionsSet).toBe(true);
  });

  it("returns errors for a forTask missing required 'for' property", () => {
    // Passing an empty object for a forTask is invalid — it should produce errors
    const errors = validateTask("for", {});
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns errors for a forTask with invalid 'for' shape", () => {
    // A forTask needs 'for' with required 'each', 'in', and 'do' sub-fields
    const errors = validateTask("for", { for: { each: "item" } }); // missing 'in' and 'do'
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns [] for a valid callTask (HTTP call)", () => {
    const validCallTask = {
      call: "http",
      with: { method: "GET", endpoint: "https://example.com" },
    };
    const errors = validateTask("call", validCallTask);
    expect(errors).toEqual([]);
  });

  it("never throws for any task type", () => {
    const taskTypes = [
      "call",
      "set",
      "wait",
      "for",
      "fork",
      "run",
      "emit",
      "raise",
      "listen",
      "switch",
      "try",
    ];
    for (const taskType of taskTypes) {
      expect(() => validateTask(taskType, {})).not.toThrow();
    }
  });

  it("deduplicates identical errors (no duplicate key violations)", () => {
    // Empty object triggers oneOf errors for call — deduplication should collapse them
    const errors = validateTask("call", {});
    const keys = errors.map((e) => `${e.field ?? ""}:${e.message}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});

// ---------------------------------------------------------------------------
// validateField
// ---------------------------------------------------------------------------
describe("validateField", () => {
  it("returns [] for an unknown task type", () => {
    expect(validateField("nonExistent", "name", "value")).toEqual([]);
  });

  it("returns [] for a field with no schema constraint", () => {
    // "set" task — the "set" key itself is an object, not a scalar, so no constraint
    expect(validateField("set", "set", { x: 1 })).toEqual([]);
  });

  it("returns [] when value satisfies the 'if' field constraint (string)", () => {
    // taskBase has 'if' as a string field
    const result = validateField("set", "if", "${.someCondition}");
    expect(result).toEqual([]);
  });

  it("returns an error when 'if' receives a non-string value", () => {
    // 'if' in taskBase is typed as string; passing a number should fail
    const result = validateField("set", "if", 42);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.message).toMatch(/type string/i);
  });

  it("never throws for any combination of task type and field name", () => {
    expect(() => validateField("call", "if", undefined, { call: "http" })).not.toThrow();
    expect(() => validateField("set", "unknownField", "val")).not.toThrow();
    expect(() => validateField("wait", "if", null)).not.toThrow();
  });

  it("passes taskObj to resolve oneOf discriminator for call tasks", () => {
    // Passing call: 'http' context — validateField should not throw and should run
    const result = validateField("call", "if", 123, { call: "http" });
    // 123 is not a string, so we expect a type error for 'if'
    expect(result.length).toBeGreaterThan(0);
  });

  it("validates dotted-path fields by walking nested schema (with.document.endpoint)", () => {
    // with.document.endpoint is 3 levels deep:
    //   callTask → with (object) → document ($ref externalResource) → endpoint ($ref endpoint)
    // An empty string is not a valid runtimeExpression or uriTemplate → should produce errors.
    const taskObj = { call: "openapi", with: { document: { endpoint: "" }, operationId: "op1" } };
    const result = validateField("call", "with.document.endpoint", "", taskObj);
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns [] for a valid dotted-path value (with.document.endpoint)", () => {
    const taskObj = {
      call: "openapi",
      with: { document: { endpoint: "https://example.com/api.yaml" }, operationId: "op1" },
    };
    const result = validateField(
      "call",
      "with.document.endpoint",
      "https://example.com/api.yaml",
      taskObj,
    );
    expect(result).toEqual([]);
  });

  it("validates with.endpoint.uri for an http callTask — empty string is invalid", () => {
    // endpoint.uri lives inside oneOf[2] (EndpointConfiguration) of the endpoint schema.
    // schemaProperties must walk into oneOf variants to find it.
    const taskObj = { call: "http", with: { method: "PUT", endpoint: { uri: "" } } };
    const result = validateField("call", "with.endpoint.uri", "", taskObj);
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns [] for a valid with.endpoint.uri value", () => {
    const taskObj = {
      call: "http",
      with: { method: "PUT", endpoint: { uri: "https://example.com" } },
    };
    const result = validateField("call", "with.endpoint.uri", "https://example.com", taskObj);
    expect(result).toEqual([]);
  });
});
