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
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { I18nProvider } from "@openworkflowspec/i18n";
import { en } from "../../../../src/i18n/locales/en";
import {
  EnumControl,
  getInnerObjectForPath,
} from "../../../../src/side-panel/forms/customFields/EnumControl";
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
  validateField,
  errorMessage,
}: {
  field: EnumField;
  defaultValue?: unknown;
  taskData?: Record<string, unknown>;
  isReadOnly?: boolean;
  validateField?: (path: string) => void;
  errorMessage?: string;
}) {
  const form = useForm<Record<string, unknown>>({
    defaultValues: defaultValue !== undefined ? { [field.path]: defaultValue } : {},
  });

  React.useEffect(() => {
    if (errorMessage) {
      form.setError(field.path, { type: "schema", message: errorMessage });
    } else {
      form.clearErrors(field.path);
    }
  }, [form, field.path, errorMessage]);

  return (
    <I18nProvider locale="en" dictionaries={{ en }}>
      <TaskFormContext.Provider
        value={{ isReadOnly, siblingTaskNames: [], taskData, validateField }}
      >
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

  it("returns null for malformed YAML", () => {
    render(<EnumControlWrapper field={backoffEnumField} defaultValue={{ exponential: {} }} />);
    const textarea = screen.getByRole("textbox", { name: "exponential" });
    fireEvent.change(textarea, { target: { value: "[unclosed" } });
    expect(getInnerObjectForPath("catch.retry.backoff", "yaml")).toBeNull();
  });

  it("returns null for a valid YAML scalar (non-object)", () => {
    render(<EnumControlWrapper field={backoffEnumField} defaultValue={{ exponential: {} }} />);
    const textarea = screen.getByRole("textbox", { name: "exponential" });
    fireEvent.change(textarea, { target: { value: "42" } });
    expect(getInnerObjectForPath("catch.retry.backoff", "yaml")).toBeNull();
  });

  it("returns empty object when textarea is cleared", () => {
    render(
      <EnumControlWrapper field={backoffEnumField} defaultValue={{ exponential: { rate: 2 } }} />,
    );
    const textarea = screen.getByRole("textbox", { name: "exponential" });
    fireEvent.change(textarea, { target: { value: "" } });
    expect(getInnerObjectForPath("catch.retry.backoff", "yaml")).toEqual({});
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

  it("renders a single error message beneath the textarea when an error is present", () => {
    render(
      <EnumControlWrapper
        field={backoffEnumField}
        defaultValue={{ exponential: {} }}
        errorMessage="Must be a valid YAML/JSON object"
      />,
    );

    const textarea = screen.getByRole("textbox", { name: "exponential" });
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Must be a valid YAML/JSON object");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
  });

  it("calls validateField on textarea blur", () => {
    const validateField = vi.fn();
    render(
      <EnumControlWrapper
        field={backoffEnumField}
        defaultValue={{ exponential: {} }}
        validateField={validateField}
      />,
    );

    const textarea = screen.getByRole("textbox", { name: "exponential" });
    fireEvent.blur(textarea);

    expect(validateField).toHaveBeenCalledWith("catch.retry.backoff");
  });

  it("renders error message beneath combobox when inner textarea is not visible", () => {
    render(
      <EnumControlWrapper field={plainEnumField} defaultValue="get" errorMessage="Field error" />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Field error");
  });
});
