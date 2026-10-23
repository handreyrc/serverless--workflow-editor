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

import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { I18nProvider } from "@openworkflowspec/i18n";
import { en } from "../../../src/i18n/locales/en";
import { VariantPicker } from "../../../src/side-panel/forms/VariantPicker";
import { TaskFormContext } from "../../../src/side-panel/forms/taskFormContext";
import type { OneOfField, StringField } from "../../../src/core/schemaToFormFields";

vi.mock("../../../src/side-panel/forms/ui/combobox", async () => {
  const { createComboboxStub } = await import("../../test-utils/combobox-stub");
  return createComboboxStub();
});

function stringLeaf(path: string): StringField {
  return {
    kind: "string",
    path,
    label: path,
    required: false,
    multiline: false,
    isRuntimeExpression: false,
  };
}

const ONLY_A = "choice.onlyA";
const ONLY_B = "choice.onlyB";
const SHARED = "choice.shared";

const choiceField: OneOfField = {
  kind: "one-of",
  path: "choice",
  label: "Choice",
  required: false,
  variants: [
    {
      label: "A",
      fields: [stringLeaf(ONLY_A), stringLeaf(SHARED)],
      matchesData: () => true,
      constWrites: {},
    },
    {
      label: "B",
      fields: [stringLeaf(ONLY_B), stringLeaf(SHARED)],
      matchesData: () => false,
      constWrites: {},
    },
  ],
};

function PickerHarness({
  formRef,
}: {
  formRef: React.MutableRefObject<UseFormReturn<Record<string, unknown>> | null>;
}) {
  const form = useForm<Record<string, unknown>>({
    defaultValues: { choice: { onlyA: "a", shared: "s" } },
  });
  React.useLayoutEffect(() => {
    formRef.current = form;
    for (const path of [ONLY_A, ONLY_B, SHARED]) {
      form.setError(path, { type: "schema", message: `${path} is invalid` });
    }
  }, [form, formRef]);

  return (
    <I18nProvider locale="en" dictionaries={{ en }}>
      <TaskFormContext.Provider value={{ isReadOnly: false, siblingTaskNames: [], taskData: {} }}>
        <FormProvider {...form}>
          <VariantPicker field={choiceField} />
        </FormProvider>
      </TaskFormContext.Provider>
    </I18nProvider>
  );
}

describe("VariantPicker — error clearing on variant switch", () => {
  it("clears errors on the old variant's paths, shared ones included, and leaves new-only paths alone", async () => {
    const formRef: React.MutableRefObject<UseFormReturn<Record<string, unknown>> | null> = {
      current: null,
    };
    const user = userEvent.setup();
    render(<PickerHarness formRef={formRef} />);

    const errorOf = (path: string) => formRef.current!.getFieldState(path).error?.message;
    expect(errorOf(ONLY_A)).toBe(`${ONLY_A} is invalid`);

    await user.click(screen.getByRole("button", { name: "B" }));

    expect(errorOf(ONLY_A)).toBeUndefined();
    expect(errorOf(SHARED)).toBeUndefined();
    expect(errorOf(ONLY_B)).toBe(`${ONLY_B} is invalid`);
  });
});
