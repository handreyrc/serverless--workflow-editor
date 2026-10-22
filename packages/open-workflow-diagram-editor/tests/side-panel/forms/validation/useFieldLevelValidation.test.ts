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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { UseFormReturn } from "react-hook-form";
import type { FormFieldDescriptor } from "../../../../src/core/schemaToFormFields";
import { useFieldLevelValidation } from "../../../../src/side-panel/forms/validation/useFieldLevelValidation";
import { validateTaskData } from "../../../../src/side-panel/forms/validation/schemaValidator";

vi.mock("../../../../src/side-panel/forms/validation/schemaValidator", () => ({
  validateTaskData: vi.fn().mockReturnValue(null),
}));

describe("useFieldLevelValidation", () => {
  beforeEach(() => {
    vi.mocked(validateTaskData).mockReturnValue(null);
  });

  const fields: FormFieldDescriptor[] = [
    {
      kind: "duration",
      path: "wait",
      label: "Wait Duration",
      required: true,
    },
    {
      kind: "object",
      path: "auth",
      label: "Auth",
      required: false,
      children: [
        {
          kind: "string",
          path: "auth.token",
          label: "Token",
          required: true,
          multiline: false,
          isRuntimeExpression: false,
        },
      ],
    },
  ];

  it("does nothing in read-only mode", () => {
    const setError = vi.fn();
    const clearErrors = vi.fn();
    const form = {
      getValues: vi.fn().mockReturnValue({ wait: "invalid" }),
      setError,
      clearErrors,
    } as unknown as UseFormReturn<Record<string, unknown>>;

    const { result } = renderHook(() => useFieldLevelValidation("wait", form, true, fields));

    result.current.validateField("wait");

    expect(setError).not.toHaveBeenCalled();
    expect(clearErrors).not.toHaveBeenCalled();
  });

  it("sets error when field value violates schema in edit mode", () => {
    vi.mocked(validateTaskData).mockReturnValueOnce([
      {
        keyword: "pattern",
        instancePath: "/wait",
        schemaPath: "#/properties/wait/pattern",
        params: { pattern: "^P" },
        message: 'must match pattern "^P"',
      },
    ]);

    const setError = vi.fn();
    const clearErrors = vi.fn();
    const form = {
      getValues: vi.fn().mockReturnValue({ wait: "invalid-duration" }),
      setError,
      clearErrors,
    } as unknown as UseFormReturn<Record<string, unknown>>;

    const { result } = renderHook(() => useFieldLevelValidation("wait", form, false, fields));

    result.current.validateField("wait");

    expect(setError).toHaveBeenCalledWith(
      "wait",
      expect.objectContaining({
        type: "schema",
      }),
    );
  });

  it("clears error when field value is valid in edit mode", () => {
    // validateTaskData returns null (no errors) via the beforeEach default — valid value.
    const setError = vi.fn();
    const clearErrors = vi.fn();
    const form = {
      getValues: vi.fn().mockReturnValue({ wait: "PT5S" }),
      setError,
      clearErrors,
    } as unknown as UseFormReturn<Record<string, unknown>>;

    const { result } = renderHook(() => useFieldLevelValidation("wait", form, false, fields));

    result.current.validateField("wait");

    expect(clearErrors).toHaveBeenCalledWith("wait");
  });

  it("clears section errors when an optional section is cleared", () => {
    const setError = vi.fn();
    const clearErrors = vi.fn();
    const form = {
      getValues: vi.fn().mockReturnValue({ auth: { token: "" } }),
      setError,
      clearErrors,
    } as unknown as UseFormReturn<Record<string, unknown>>;

    const { result } = renderHook(() => useFieldLevelValidation("call", form, false, fields));

    result.current.validateField("auth.token");

    expect(clearErrors).toHaveBeenCalledWith(["auth.token"]);
    expect(validateTaskData).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it("ignores empty paths and internal sentinel paths", () => {
    const setError = vi.fn();
    const clearErrors = vi.fn();
    const form = {
      getValues: vi.fn().mockReturnValue({}),
      setError,
      clearErrors,
    } as unknown as UseFormReturn<Record<string, unknown>>;

    const { result } = renderHook(() => useFieldLevelValidation("wait", form, false, fields));

    result.current.validateField("");
    result.current.validateField("__oneof__.auth");
    result.current.validateField("__internal");

    expect(form.getValues).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
    expect(clearErrors).not.toHaveBeenCalled();
  });

  it("validates a required section that is now empty instead of clearing its errors", () => {
    const requiredSectionFields: FormFieldDescriptor[] = [
      {
        kind: "object",
        path: "with",
        label: "HTTP Endpoint Configuration",
        required: true,
        children: [
          {
            kind: "string",
            path: "with.endpoint",
            label: "Endpoint URI",
            required: true,
            multiline: false,
            isRuntimeExpression: false,
          },
        ],
      },
    ];

    vi.mocked(validateTaskData).mockReturnValueOnce([
      {
        keyword: "required",
        instancePath: "/with",
        schemaPath: "#/properties/with/required",
        params: { missingProperty: "endpoint" },
        message: "must have required property 'endpoint'",
      },
    ]);

    const setError = vi.fn();
    const clearErrors = vi.fn();
    const form = {
      getValues: vi.fn().mockReturnValue({ with: { endpoint: "" } }),
      setError,
      clearErrors,
    } as unknown as UseFormReturn<Record<string, unknown>>;

    const { result } = renderHook(() =>
      useFieldLevelValidation("callTask", form, false, requiredSectionFields),
    );

    result.current.validateField("with.endpoint");

    expect(setError).toHaveBeenCalledWith(
      "with.endpoint",
      expect.objectContaining({
        type: "schema",
        message: "must have required property 'endpoint'",
      }),
    );
    expect(clearErrors).not.toHaveBeenCalledWith(expect.arrayContaining(["with.endpoint"]));
  });

  it("extracts and forwards live oneof sentinels during validation", () => {
    const setError = vi.fn();
    const clearErrors = vi.fn();
    const form = {
      getValues: vi.fn().mockReturnValue({
        __oneof__: { auth: { __self__: "bearer" } },
        wait: "PT10S",
      }),
      setError,
      clearErrors,
    } as unknown as UseFormReturn<Record<string, unknown>>;

    const { result } = renderHook(() => useFieldLevelValidation("wait", form, false, fields));

    result.current.validateField("wait");

    expect(clearErrors).toHaveBeenCalledWith("wait");
  });
});
