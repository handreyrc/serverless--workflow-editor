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

import { describe, it, expect, vi } from "vitest";
import type { FormFieldDescriptor } from "../../../../src/core/schemaToFormFields";
import { collectSchemaFieldErrors } from "../../../../src/side-panel/forms/validation/collectSchemaFieldErrors";
import { validateTaskData } from "../../../../src/side-panel/forms/validation/schemaValidator";

vi.mock("../../../../src/side-panel/forms/validation/schemaValidator", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../src/side-panel/forms/validation/schemaValidator")
    >();
  return { ...actual, validateTaskData: vi.fn(actual.validateTaskData) };
});

const waitFields: FormFieldDescriptor[] = [
  { kind: "duration", path: "wait", label: "Wait Duration", required: true },
];

describe("collectSchemaFieldErrors", () => {
  it.each([
    { name: "valid value", values: { wait: "PT5S" }, expectedPaths: [] },
    { name: "invalid value", values: { wait: "invalid-duration" }, expectedPaths: ["wait"] },
  ])("returns the whole-task result for a $name", ({ values, expectedPaths }) => {
    const errors = collectSchemaFieldErrors("wait", values, waitFields);

    expect(Object.keys(errors)).toEqual(expectedPaths);
  });

  it("restricts the result to the scoped path when one is given", () => {
    const values = { wait: "invalid-duration" };

    expect(Object.keys(collectSchemaFieldErrors("wait", values, waitFields, "wait"))).toEqual([
      "wait",
    ]);
    expect(collectSchemaFieldErrors("wait", values, waitFields, "other")).toEqual({});
  });

  it("returns no errors for an unknown node type", () => {
    expect(collectSchemaFieldErrors("nonExistentType", { foo: "bar" })).toEqual({});
  });

  it("passes the flattened __oneof__ sentinels through to value preparation", () => {
    const values = { wait: "PT5S", __oneof__: { endpoint: { selected: 1 } } };

    collectSchemaFieldErrors("wait", values, waitFields);

    const validated = vi.mocked(validateTaskData).mock.lastCall?.[1];
    expect(validated).toEqual({ wait: "PT5S" });
  });
});
