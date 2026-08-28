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
import { FieldControl } from "../../src/side-panel/FieldControls";
import type { DetailField } from "../../src/core/taskDetails";
import { renderWithProviders } from "../test-utils/render-helpers";

describe("FieldControl", () => {
  describe("scalar", () => {
    const scalarCases: Array<[string, DetailField, string]> = [
      ["string", { path: "call", kind: "scalar", value: "http" }, "http"],
      ["number", { path: "with.port", kind: "scalar", value: 8080 }, "8080"],
    ];

    it.each(scalarCases)("renders a %s as a disabled input", (_label, field, displayed) => {
      renderWithProviders(<FieldControl field={field} />);

      const control = screen.getByDisplayValue(displayed);
      expect(control.tagName).toBe("INPUT");
      expect(control).toBeDisabled();
    });

    it("renders a number scalar as a number input", () => {
      renderWithProviders(
        <FieldControl field={{ path: "with.port", kind: "scalar", value: 8080 }} />,
      );

      expect(screen.getByDisplayValue("8080")).toHaveAttribute("type", "number");
    });

    it("renders a boolean as a disabled switch", () => {
      renderWithProviders(
        <FieldControl field={{ path: "fork.compete", kind: "scalar", value: true }} />,
      );

      const control = screen.getByRole("switch");
      expect(control).toBeChecked();
      expect(control).toBeDisabled();
    });
  });

  it("renders a long string as a disabled textarea", () => {
    renderWithProviders(
      <FieldControl field={{ path: "run.script.code", kind: "long-string", value: "echo hi" }} />,
    );

    const control = screen.getByDisplayValue("echo hi");
    expect(control.tagName).toBe("TEXTAREA");
    expect(control).toBeDisabled();
  });

  it("constrains a duration to the ISO 8601 format", () => {
    renderWithProviders(
      <FieldControl field={{ path: "timeout.after", kind: "duration", value: "PT5M" }} />,
    );

    const control = screen.getByDisplayValue("PT5M");
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute("pattern");
    expect(control).toHaveAttribute("title", expect.stringContaining("ISO 8601"));
  });

  it("renders an enum as a combobox showing the selected option", () => {
    renderWithProviders(
      <FieldControl
        field={{
          path: "with.output",
          kind: "enum",
          value: "content",
          options: ["raw", "content", "response"],
        }}
      />,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  /* Arrays and objects are not editable in the panel — they report their shape and the
     full value stays available in the Source section. */
  it.each([
    [1, "1 item"],
    [3, "3 items"],
  ])("summarises an array of %i as %s", (count, expected) => {
    renderWithProviders(<FieldControl field={{ path: "switch", kind: "array", count }} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("renders an object as a placeholder glyph", () => {
    renderWithProviders(<FieldControl field={{ path: "with.headers", kind: "object" }} />);

    expect(screen.getByText("{...}")).toBeInTheDocument();
  });
});
