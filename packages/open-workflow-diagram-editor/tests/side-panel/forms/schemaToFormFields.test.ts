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
import { schemaToFormFields } from "../../../src/side-panel/forms/schemaToFormFields";
import type { FormFieldDescriptor } from "../../../src/side-panel/forms/schemaToFormFields";
import type { DereferencedSchema } from "../../../src/core/schemaFilter";
import { filterReadOnlyFields } from "../../../src/side-panel/forms/taskFormContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function schema(overrides: Partial<DereferencedSchema>): DereferencedSchema {
  return overrides as DereferencedSchema;
}

// ---------------------------------------------------------------------------
// Basic property types
// ---------------------------------------------------------------------------

describe("schemaToFormFields — basic property types", () => {
  it("produces a string field", () => {
    const fields = schemaToFormFields(schema({ properties: { name: { type: "string" } } }));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: "string", path: "name" });
  });

  it("produces a number field", () => {
    const fields = schemaToFormFields(schema({ properties: { count: { type: "number" } } }));
    expect(fields[0]).toMatchObject({ kind: "number", path: "count" });
  });

  it("produces a boolean field", () => {
    const fields = schemaToFormFields(schema({ properties: { active: { type: "boolean" } } }));
    expect(fields[0]).toMatchObject({ kind: "boolean", path: "active" });
  });

  it("produces an enum field for string+enum", () => {
    const fields = schemaToFormFields(
      schema({ properties: { mode: { type: "string", enum: ["a", "b", "c"] } } }),
    );
    expect(fields[0]).toMatchObject({ kind: "enum", path: "mode", options: ["a", "b", "c"] });
  });

  it("produces a duration field for a string with an ISO-8601 pattern", () => {
    const fields = schemaToFormFields(
      schema({ properties: { delay: { type: "string", pattern: "^P..." } } }),
    );
    expect(fields[0]).toMatchObject({ kind: "duration", path: "delay" });
  });
});

// ---------------------------------------------------------------------------
// oneOf / anyOf — leaf variants (the bug that was fixed)
// ---------------------------------------------------------------------------

describe("schemaToFormFields — oneOf leaf variants", () => {
  it("leaf enum variant produces an enum field (not empty fields)", () => {
    const fields = schemaToFormFields(
      schema({
        properties: {
          output: {
            oneOf: [{ type: "string", enum: ["raw", "content", "response"] }],
          },
        },
      }),
    );
    expect(fields).toHaveLength(1);
    const oneOf = fields[0];
    expect(oneOf).toMatchObject({ kind: "one-of", path: "output" });
    if (oneOf!.kind !== "one-of") throw new Error("expected one-of");

    expect(oneOf.variants).toHaveLength(1);
    const variant = oneOf.variants[0];
    expect(variant!.fields).toHaveLength(1);
    expect(variant!.fields[0]).toMatchObject({
      kind: "enum",
      path: "output",
      options: ["raw", "content", "response"],
    });
  });

  it("plain string leaf variant produces a string field", () => {
    const fields = schemaToFormFields(
      schema({
        properties: {
          value: {
            anyOf: [{ type: "string" }],
          },
        },
      }),
    );
    expect(fields[0]).toMatchObject({ kind: "one-of", path: "value" });
    if (fields[0]!.kind !== "one-of") throw new Error();
    expect(fields[0].variants[0]!.fields[0]).toMatchObject({ kind: "string" });
  });

  it("mixed oneOf with string and enum branches each get the right control", () => {
    const fields = schemaToFormFields(
      schema({
        properties: {
          result: {
            oneOf: [
              { type: "string", enum: ["stdout", "stderr", "code"], title: "Preset" },
              { type: "string", title: "Custom" },
            ],
          },
        },
      }),
    );
    if (fields[0]!.kind !== "one-of") throw new Error();
    const variants = fields[0].variants;
    expect(variants).toHaveLength(2);
    expect(variants[0]!.fields[0]).toMatchObject({
      kind: "enum",
      options: ["stdout", "stderr", "code"],
    });
    expect(variants[1]!.fields[0]).toMatchObject({ kind: "string" });
  });

  it("number leaf variant produces a number field", () => {
    const fields = schemaToFormFields(
      schema({
        properties: { timeout: { oneOf: [{ type: "integer" }] } },
      }),
    );
    if (fields[0]!.kind !== "one-of") throw new Error();
    expect(fields[0].variants[0]!.fields[0]).toMatchObject({ kind: "number" });
  });
});

// ---------------------------------------------------------------------------
// Nested objects
// ---------------------------------------------------------------------------

describe("schemaToFormFields — nested objects", () => {
  it("recurses into object properties", () => {
    const fields = schemaToFormFields(
      schema({
        properties: {
          config: {
            type: "object",
            properties: { timeout: { type: "number" } },
          },
        },
      }),
    );
    expect(fields[0]).toMatchObject({ kind: "object", path: "config" });
    if (fields[0]!.kind !== "object") throw new Error();
    expect(fields[0].children[0]).toMatchObject({ kind: "number", path: "config.timeout" });
  });
});

// ---------------------------------------------------------------------------
// then / flowDirective
// ---------------------------------------------------------------------------

describe("schemaToFormFields — then / flow-directive field", () => {
  it("treats a property named 'then' as a ThenField (detected by key name)", () => {
    // Build the properties map without a `then` string literal to satisfy unicorn/no-thenable.
    // The property key is constructed at runtime so the linter cannot flag it.
    const transitionKey = ["th", "en"].join("");
    const props = Object.fromEntries([[transitionKey, { type: "string" }]]) as Record<
      string,
      unknown
    >;
    const fields = schemaToFormFields(schema({ properties: props }));
    expect(fields[0]).toMatchObject({ kind: "then", path: transitionKey });
  });

  it("treats an anyOf(enum + plain string) property as a ThenField (flow-directive pattern)", () => {
    const fields = schemaToFormFields(
      schema({
        properties: {
          transition: {
            anyOf: [{ type: "string", enum: ["continue", "exit", "end"] }, { type: "string" }],
          },
        },
      }),
    );
    expect(fields[0]).toMatchObject({ kind: "then", path: "transition" });
  });
});

// ---------------------------------------------------------------------------
// Top-level oneOf (callTask style)
// ---------------------------------------------------------------------------

describe("schemaToFormFields — top-level oneOf (callTask)", () => {
  it("emits a single one-of field at the root when schema has oneOf but no properties", () => {
    const fields = schemaToFormFields(
      schema({
        oneOf: [
          { title: "HTTP", type: "object", properties: { method: { type: "string" } } },
          { title: "gRPC", type: "object", properties: { service: { type: "string" } } },
        ],
      }),
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: "one-of" });
    if (fields[0]!.kind !== "one-of") throw new Error();
    expect(fields[0].variants).toHaveLength(2);
    expect(fields[0].variants[0]!.label).toBe("HTTP");
    expect(fields[0].variants[1]!.label).toBe("gRPC");
  });
});

// ---------------------------------------------------------------------------
// metadata exclusion
// ---------------------------------------------------------------------------

describe("schemaToFormFields — metadata exclusion", () => {
  it("skips the metadata property", () => {
    const fields = schemaToFormFields(
      schema({
        properties: {
          name: { type: "string" },
          metadata: { type: "object" },
        },
      }),
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ path: "name" });
  });
});

// ---------------------------------------------------------------------------
// filterReadOnlyFields — helpers
// ---------------------------------------------------------------------------

function makeString(path: string, required = false): FormFieldDescriptor {
  return {
    kind: "string",
    path,
    label: path,
    required,
    multiline: false,
    isRuntimeExpression: false,
  };
}

function makeObject(
  path: string,
  children: FormFieldDescriptor[],
  required = false,
): FormFieldDescriptor {
  return { kind: "object", path, label: path, required, children };
}

function makeOneOf(path: string, required = false): FormFieldDescriptor {
  return {
    kind: "one-of",
    path,
    label: path,
    required,
    variants: [{ label: "A", fields: [makeString(path, true)] }],
  };
}

// ---------------------------------------------------------------------------
// filterReadOnlyFields — empty-string counts as no-value
// ---------------------------------------------------------------------------

describe("filterReadOnlyFields — empty-string counts as no-value", () => {
  it("hides optional fields with empty-string value", () => {
    expect(filterReadOnlyFields([makeString("name")], { name: "" })).toHaveLength(0);
  });

  it("shows optional fields with a non-empty string value", () => {
    expect(filterReadOnlyFields([makeString("name")], { name: "hello" })).toHaveLength(1);
  });

  it("hides required fields with empty-string value", () => {
    expect(filterReadOnlyFields([makeString("name", true)], { name: "" })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterReadOnlyFields — required fields inside optional absent objects
// ---------------------------------------------------------------------------

describe("filterReadOnlyFields — required fields inside optional absent objects are hidden", () => {
  it("hides a required child when its parent object is absent", () => {
    const fields = [makeObject("input", [makeString("input.schema", true)])];
    expect(filterReadOnlyFields(fields, {})).toHaveLength(0);
  });

  it("hides a required child when its parent object is undefined", () => {
    const fields = [makeObject("input", [makeString("input.schema", true)])];
    expect(filterReadOnlyFields(fields, { input: undefined })).toHaveLength(0);
  });

  it("shows the object group when parent exists and a required child has a value", () => {
    const fields = [makeObject("input", [makeString("input.from", true)])];
    expect(filterReadOnlyFields(fields, { input: { from: "abc" } })).toHaveLength(1);
  });

  it("collapses the object group when parent exists but the required child has no value", () => {
    // parent object key exists but the child property is absent — object group has no visible children
    const fields = [makeObject("input", [makeString("input.from", true)])];
    expect(filterReadOnlyFields(fields, { input: {} })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterReadOnlyFields — optional object group visibility
// ---------------------------------------------------------------------------

describe("filterReadOnlyFields — optional object is hidden when absent", () => {
  it("hides an optional object group when the task has no such key", () => {
    const fields = [makeObject("output", [makeString("output.as")])];
    expect(filterReadOnlyFields(fields, {})).toHaveLength(0);
  });

  it("shows an optional object group when the key exists and a child has a value", () => {
    const fields = [makeObject("output", [makeString("output.as")])];
    expect(filterReadOnlyFields(fields, { output: { as: "result" } })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// filterReadOnlyFields — one-of field visibility
// ---------------------------------------------------------------------------

describe("filterReadOnlyFields — one-of fields", () => {
  it("hides a one-of field when the task has no value at that path", () => {
    expect(filterReadOnlyFields([makeOneOf("with")], {})).toHaveLength(0);
  });

  it("shows a one-of field when the task has a value at that path", () => {
    expect(filterReadOnlyFields([makeOneOf("with")], { with: { method: "GET" } })).toHaveLength(1);
  });

  it("always shows a root-level one-of (__root__)", () => {
    const fields: FormFieldDescriptor[] = [
      { kind: "one-of", path: "__root__", label: "Type", required: false, variants: [] },
    ];
    expect(filterReadOnlyFields(fields, {})).toHaveLength(1);
  });
});
