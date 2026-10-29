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

import { describe, expect, it } from "vitest";
import type { EnumField } from "../../../../src/core/schemaToFormFields";
import {
  getValueMapInnerObject,
  parseInnerObject,
} from "../../../../src/side-panel/forms/customFields/innerObjectText";
import { innerTextPath } from "../../../../src/side-panel/forms/sentinels";

const backoff: EnumField = {
  kind: "enum",
  path: "catch.retry.backoff",
  label: "Backoff",
  required: false,
  options: ["constant", "exponential", "linear"],
  valueMap: {
    constant: { constant: {} },
    exponential: { exponential: {} },
    linear: { linear: {} },
  },
  innerObjectFormat: "yaml",
};

describe("parseInnerObject", () => {
  it.each<[string, string | undefined, "yaml" | "json", unknown]>([
    ["no text", undefined, "yaml", {}],
    ["blank text", "  ", "yaml", {}],
    ["a YAML object", "multiplier: 3", "yaml", { multiplier: 3 }],
    ["a JSON object", '{"multiplier": 3}', "json", { multiplier: 3 }],
    ["malformed YAML", "[unclosed", "yaml", null],
    ["malformed JSON", "{", "json", null],
    ["a scalar", "42", "yaml", null],
    ["an array", "- a", "yaml", null],
  ])("reads %s", (_name, text, format, expected) => {
    expect(parseInnerObject(text, format)).toEqual(expected);
  });
});

describe("getValueMapInnerObject", () => {
  const values = { __innertext__: { catch: { retry: { backoff: "multiplier: 3" } } } };

  it("parses the text the form values hold for the field", () => {
    expect(innerTextPath(backoff.path)).toBe("__innertext__.catch.retry.backoff");
    expect(getValueMapInnerObject(backoff, "exponential", values)).toEqual({ multiplier: 3 });
  });

  it("is empty when no option is selected", () => {
    expect(getValueMapInnerObject(backoff, "", values)).toEqual({});
  });
});
