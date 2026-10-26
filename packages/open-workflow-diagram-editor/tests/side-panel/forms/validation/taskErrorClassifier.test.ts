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
import type { ErrorObject } from "ajv/dist/2020";
import type { FormFieldDescriptor } from "../../../../src/core/schemaToFormFields";
import { buildActiveFormView } from "../../../../src/side-panel/forms/validation/activeFormView";
import { GROUP_KEYWORD } from "../../../../src/side-panel/forms/validation/branchGroups";
import { classifyTaskErrors } from "../../../../src/side-panel/forms/validation/taskErrorClassifier";

const leaf = (path: string, required = false): FormFieldDescriptor => ({
  kind: "string",
  path,
  label: path,
  required,
  multiline: false,
  isRuntimeExpression: false,
});

const fields: FormFieldDescriptor[] = [
  leaf("name", true),
  { kind: "json", path: "payload", label: "payload", required: false, format: "yaml" },
  { kind: "section", path: "__common__", label: "common", required: false, children: [leaf("if")] },
  {
    kind: "object",
    path: "obj",
    label: "obj",
    required: true,
    children: [leaf("obj.a", true), leaf("obj.b")],
  },
  {
    kind: "object",
    path: "optional",
    label: "optional",
    required: false,
    children: [leaf("optional.a", true)],
  },
  { kind: "child-task-list", path: "do", label: "do", required: true },
  {
    kind: "ordered-map",
    path: "cases",
    label: "cases",
    required: true,
    itemFields: [leaf("when")],
  },
];

function error(
  keyword: string,
  instancePath: string,
  params: Record<string, unknown> = {},
  message = `${keyword} message`,
): ErrorObject {
  return { keyword, instancePath, schemaPath: `#/${keyword}`, params, message };
}

const missing = (instancePath: string, property: string) =>
  error("required", instancePath, { missingProperty: property }, `missing ${property}`);

function classify(errors: ErrorObject[] | null | undefined, values: Record<string, unknown> = {}) {
  return classifyTaskErrors(errors, buildActiveFormView(fields, {}, values), values, fields);
}

describe("classifyTaskErrors", () => {
  it.each([null, undefined, []])("returns no errors for %j", (errors) => {
    expect(classify(errors)).toEqual({ fieldErrors: {}, levelErrors: {} });
  });

  describe("field errors", () => {
    it.each([
      { name: "a value on a field", errors: [error("type", "/name")], path: "name" },
      { name: "a missing field", errors: [missing("", "name")], path: "name" },
      { name: "a nested field", errors: [error("type", "/obj/a")], path: "obj.a" },
      { name: "a missing nested field", errors: [missing("/obj", "a")], path: "obj.a" },
      { name: "a common field", errors: [error("type", "/if")], path: "if" },
    ])("places $name on the field", ({ errors, path }) => {
      expect(Object.keys(classify(errors, { obj: { b: "x" } }).fieldErrors)).toEqual([path]);
    });

    it("places an error under a whole-value field on that field", () => {
      const result = classify([error("type", "/payload/a/b")]);

      expect(Object.keys(result.fieldErrors)).toEqual(["payload"]);
    });

    it("keeps the first message when a field has several errors", () => {
      const result = classify([
        error("type", "/name", {}, "first"),
        error("minLength", "/name", {}, "second"),
      ]);

      expect(result.fieldErrors).toEqual({ name: "first" });
    });

    it("keeps the message of the schema", () => {
      expect(classify([missing("", "name")]).fieldErrors).toEqual({ name: "missing name" });
    });
  });

  describe("level errors", () => {
    it.each([
      {
        keyword: "required",
        params: { missingProperty: "obj" },
        instancePath: "",
        expected: ["obj"],
      },
      { keyword: "minProperties", params: {}, instancePath: "/obj", expected: ["obj"] },
      { keyword: "maxProperties", params: {}, instancePath: "/obj", expected: ["obj"] },
      { keyword: "dependentRequired", params: {}, instancePath: "/obj", expected: ["obj"] },
      { keyword: "propertyNames", params: {}, instancePath: "/obj", expected: ["obj"] },
      { keyword: GROUP_KEYWORD, params: {}, instancePath: "/obj", expected: ["obj"] },
      { keyword: GROUP_KEYWORD, params: {}, instancePath: "", expected: [""] },
    ])(
      "keeps a $keyword error of a container at $instancePath",
      ({ keyword, params, instancePath, expected }) => {
        const result = classify([error(keyword, instancePath, params)], { obj: { a: "x" } });

        expect(Object.keys(result.levelErrors)).toEqual(expected);
      },
    );

    it.each(["type", "pattern", "format", "enum", "const", "minLength", "maxLength", "minimum"])(
      "drops a %s error on a container, since it describes a value",
      (keyword) => {
        expect(classify([error(keyword, "/obj")])).toEqual({ fieldErrors: {}, levelErrors: {} });
      },
    );

    it("places a missing container on the container itself", () => {
      const result = classify([missing("", "obj")]);

      expect(result.fieldErrors).toEqual({});
      expect(Object.keys(result.levelErrors)).toEqual(["obj"]);
    });

    it("counts one level error for two errors on the same container", () => {
      const result = classify([
        error("minProperties", "/obj", {}, "first"),
        error("propertyNames", "/obj", {}, "second"),
      ]);

      expect(result.levelErrors).toEqual({ obj: "first" });
    });
  });

  describe("noise keywords and unmessageable errors", () => {
    it.each([
      { name: "unevaluatedProperties", errors: [error("unevaluatedProperties", "/obj")] },
      { name: "additionalProperties", errors: [error("additionalProperties", "/obj")] },
      { name: "if", errors: [error("if", "/obj")] },
      { name: "an error without a message", errors: [{ ...error("type", "/name"), message: "" }] },
    ])("drops $name", ({ errors }) => {
      expect(classify(errors, { obj: { a: "x" } })).toEqual({ fieldErrors: {}, levelErrors: {} });
    });
  });

  describe("untraced errors (presented in top error banner)", () => {
    it.each([
      { name: "an unknown path", errors: [error("type", "/unknown")], expectedPath: "unknown" },
      {
        name: "a missing property nothing renders",
        errors: [missing("", "unknown")],
        expectedPath: "unknown",
      },
      {
        name: "a path below a container nothing renders",
        errors: [error("type", "/obj/zzz/y")],
        expectedPath: "obj.zzz.y",
      },
    ])("retains $name for the top error banner", ({ errors, expectedPath }) => {
      const result = classify(errors, { obj: { a: "x" } });
      expect(result.fieldErrors).toEqual({});
      expect(Object.keys(result.levelErrors)).toEqual([expectedPath]);
    });
  });

  describe("subtasks", () => {
    it.each([
      error("type", "/do"),
      missing("", "do"),
      error("type", "/do/0/a/call"),
      error("required", "/do/0/a", { missingProperty: "call" }),
    ])("drops the subtask error %j", (subtaskError) => {
      expect(classify([subtaskError])).toEqual({ fieldErrors: {}, levelErrors: {} });
    });

    it("keeps an error of the parent next to a subtask error", () => {
      const result = classify([error("type", "/do/0/a/call"), error("type", "/name")]);

      expect(Object.keys(result.fieldErrors)).toEqual(["name"]);
    });
  });

  describe("optional sections", () => {
    it("drops a required error inside an empty optional section", () => {
      expect(classify([missing("/optional", "a")])).toEqual({ fieldErrors: {}, levelErrors: {} });
    });

    it("keeps a required error inside a partly filled optional section", () => {
      const values = { optional: { other: "x" } };

      const result = classify([missing("/optional", "a")], values);

      expect(Object.keys(result.fieldErrors)).toEqual(["optional.a"]);
    });

    it("keeps an error that is not a required one inside an empty optional section", () => {
      const result = classify([error("type", "/optional/a")]);

      expect(Object.keys(result.fieldErrors)).toEqual(["optional.a"]);
    });
  });

  describe("ordered maps", () => {
    it("places an error on the field an entry renders", () => {
      const result = classify([error("type", "/cases/0/a/when")]);

      expect(Object.keys(result.fieldErrors)).toEqual(["cases.0.a.when"]);
    });

    it("places a missing field of an entry on that field", () => {
      const result = classify([missing("/cases/0/a", "when")]);

      expect(Object.keys(result.fieldErrors)).toEqual(["cases.0.a.when"]);
    });

    it("places a structure error of the map on the level that shows it", () => {
      const result = classify([error("minProperties", "/cases/0")]);

      expect(Object.keys(result.levelErrors)).toEqual([""]);
    });

    it("places a structure error of the whole map on the level that shows it", () => {
      expect(Object.keys(classify([missing("", "cases")]).levelErrors)).toEqual([""]);
    });

    it("drops an error under an entry that renders nothing there", () => {
      expect(classify([error("type", "/cases/0/a/zzz")])).toEqual({
        fieldErrors: {},
        levelErrors: {},
      });
    });
  });
});
