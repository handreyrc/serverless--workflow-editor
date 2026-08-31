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
import { screen } from "@testing-library/react";
import { ReadOnlyProperties } from "../../src/side-panel/ReadOnlyProperties";
import type { DetailField } from "../../src/core/taskDetails";
import { renderWithProviders } from "../test-utils/render-helpers";

const render = (...fields: DetailField[]) =>
  renderWithProviders(<ReadOnlyProperties fields={fields} />);

describe("ReadOnlyProperties", () => {
  it("renders one labelled row per field", () => {
    const { container } = render(
      { path: "call", kind: "scalar", value: "http" },
      { path: "with.endpoint", kind: "scalar", value: "https://api.example.com" },
    );

    expect(container.querySelectorAll(".dec-sidebar-prop")).toHaveLength(2);
    expect(screen.getByText("call")).toBeInTheDocument();
    expect(screen.getByText("with.endpoint")).toBeInTheDocument();
  });

  it.each([
    ["scalar string", { path: "call", kind: "scalar", value: "http" }],
    ["scalar number", { path: "with.port", kind: "scalar", value: 8080 }],
    ["scalar boolean", { path: "fork.compete", kind: "scalar", value: true }],
    ["enum", { path: "with.output", kind: "enum", value: "content", options: ["raw", "content"] }],
    ["duration", { path: "timeout.after", kind: "duration", value: "PT5M" }],
    ["runtime-expression", { path: "if", kind: "runtime-expression", value: "${ .ok }" }],
    ["long-string", { path: "run.script.code", kind: "long-string", value: "echo hi" }],
    ["array", { path: "switch", kind: "array", count: 3 }],
    ["object", { path: "with.headers", kind: "object" }],
  ] as Array<[string, DetailField]>)("renders no form control for a %s", (_label, field) => {
    const { container } = render(field);

    expect(container.querySelector("input, textarea, select, [role='switch']")).toBeNull();
  });

  it.each([
    ["a string", { path: "call", kind: "scalar", value: "http" }, "http"],
    ["a number", { path: "with.port", kind: "scalar", value: 8080 }, "8080"],
    ["a boolean as plain text", { path: "fork.compete", kind: "scalar", value: true }, "true"],
    [
      "an enum",
      { path: "with.output", kind: "enum", value: "content", options: ["raw"] },
      "content",
    ],
    ["a duration", { path: "timeout.after", kind: "duration", value: "PT5M" }, "PT5M"],
    ["an expression", { path: "if", kind: "runtime-expression", value: "${ .ok }" }, "${ .ok }"],
  ] as Array<[string, DetailField, string]>)(
    "renders %s as its literal value",
    (_l, field, text) => {
      render(field);

      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it("renders a long value in its own capped block", () => {
    const code = "const total = items.reduce((a, b) => a + b, 0);\nreturn total;";
    const { container } = render({ path: "run.script.code", kind: "long-string", value: code });

    const block = container.querySelector(".dec-sidebar-value-block");
    expect(block).toBeInTheDocument();
    expect(block?.tagName).toBe("PRE");
    expect(block).toHaveTextContent("return total;");
  });

  /* A count and a placeholder describe shape rather than anything the task literally says. */
  it.each([
    [1, "1 item"],
    [3, "3 items"],
  ])("summarises an array of %i as %s", (count, expected) => {
    const { container } = render({ path: "switch", kind: "array", count });

    expect(container.querySelector(".dec-sidebar-value-shape")).toHaveTextContent(expected);
  });

  it("renders an object as a shape placeholder", () => {
    const { container } = render({ path: "with.headers", kind: "object" });

    expect(container.querySelector(".dec-sidebar-value-shape")).toHaveTextContent("{...}");
  });

  it("renders nothing when the task has no fields", () => {
    const { container } = render();

    expect(container.querySelectorAll(".dec-sidebar-prop")).toHaveLength(0);
  });
});
