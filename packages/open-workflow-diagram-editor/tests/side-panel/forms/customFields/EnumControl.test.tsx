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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { I18nProvider } from "@openworkflowspec/i18n";
import { en } from "../../../../src/i18n/locales/en";
import { EnumControl } from "../../../../src/side-panel/forms/customFields/EnumControl";
import { getInnerObjectForPath } from "../../../../src/side-panel/forms/customFields/EnumControl";
import { TaskFormContext } from "../../../../src/side-panel/forms/taskFormContext";
import type { EnumField } from "../../../../src/core/schemaToFormFields";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const plainEnumField: EnumField = {
  kind: "enum",
  path: "with.method",
  label: "Method",
  required: false,
  options: ["get", "post", "put", "delete"],
};

const backoffEnumField: EnumField = {
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

function EnumControlWrapper({
  field,
  defaultValue,
  taskData = {},
  isReadOnly = false,
}: {
  field: EnumField;
  defaultValue?: unknown;
  taskData?: Record<string, unknown>;
  isReadOnly?: boolean;
}) {
  const form = useForm<Record<string, unknown>>({
    defaultValues: defaultValue !== undefined ? { [field.path]: defaultValue } : {},
  });

  return (
    <I18nProvider locale="en" dictionaries={{ en }}>
      <TaskFormContext.Provider value={{ isReadOnly, siblingTaskNames: [], taskData }}>
        <FormProvider {...form}>
          <EnumControl field={field} id={`field-${field.path}`} />
        </FormProvider>
      </TaskFormContext.Provider>
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// getInnerObjectForPath unit tests
// ---------------------------------------------------------------------------

describe("getInnerObjectForPath", () => {
  it("returns empty object for an untracked path", () => {
    expect(getInnerObjectForPath("untracked.path", "yaml")).toEqual({});
    expect(getInnerObjectForPath("untracked.path", "json")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// EnumControl rendering
// ---------------------------------------------------------------------------

describe("EnumControl — plain enum", () => {
  it("renders a combobox showing the default value when empty and not required", () => {
    render(<EnumControlWrapper field={plainEnumField} />);
    expect(screen.getByRole("combobox")).toHaveValue("—");
  });

  it("renders a combobox showing the current string value", () => {
    render(<EnumControlWrapper field={plainEnumField} defaultValue="get" />);
    expect(screen.getByRole("combobox")).toHaveValue("get");
  });
});

describe("EnumControl — valueMap enum with inner object textarea", () => {
  it("renders the combobox and inner textarea when an initial valueMap discriminator is present", () => {
    render(
      <EnumControlWrapper field={backoffEnumField} defaultValue={{ exponential: { rate: 2.0 } }} />,
    );

    expect(screen.getByRole("combobox")).toHaveValue("exponential");
    const textarea = screen.getByRole("textbox", { name: "exponential" });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("rate: 2");
  });

  it("updates innerObjectTextStore when the user edits the inner textarea", async () => {
    const user = userEvent.setup();
    render(<EnumControlWrapper field={backoffEnumField} defaultValue={{ exponential: {} }} />);

    const textarea = screen.getByRole("textbox", { name: "exponential" });
    await user.type(textarea, "multiplier: 3");

    expect(getInnerObjectForPath("catch.retry.backoff", "yaml")).toEqual({ multiplier: 3 });
  });
});
