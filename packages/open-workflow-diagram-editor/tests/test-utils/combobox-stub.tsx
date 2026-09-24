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

import * as React from "react";
/**
 * A stand-in for `side-panel/forms/ui/combobox` that works under jsdom.
 *
 * base-ui opens its popup through layout APIs jsdom does not implement, so its items can
 * never be clicked in a unit test. This keeps the same prop contract and renders each item
 * as a plain button, so a test drives the *real* `handleVariantChange` instead of
 * transcribing what it does
 *
 * ```ts
 * vi.mock("../../src/side-panel/forms/ui/combobox", async () => {
 *   const { createComboboxStub } = await import("../test-utils/combobox-stub");
 *   return createComboboxStub();
 * });
 * ```
 */
export function createComboboxStub(): Record<string, unknown> {
  type Ctx = { value?: string; onValueChange?: (value: string) => void; disabled?: boolean };

  const ComboboxCtx = React.createContext<Ctx>({});
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

  return {
    Combobox: ({ children, ...ctx }: Ctx & { children?: React.ReactNode }) => (
      <ComboboxCtx.Provider value={ctx}>{children}</ComboboxCtx.Provider>
    ),

    ComboboxInput: ({
      id,
      value,
      readOnly,
      disabled,
      onBlur,
      name,
      ...rest
    }: Record<string, unknown>) => {
      const ctx = React.useContext(ComboboxCtx);
      return (
        <input
          id={id as string | undefined}
          name={name as string | undefined}
          readOnly={readOnly === true}
          disabled={disabled === true || ctx.disabled === true}
          value={(value as string | undefined) ?? ctx.value ?? ""}
          onChange={() => {}}
          onBlur={onBlur as React.FocusEventHandler<HTMLInputElement> | undefined}
          aria-label={rest["aria-label"] as string | undefined}
          aria-invalid={rest["aria-invalid"] as boolean | undefined}
        />
      );
    },

    ComboboxItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const ctx = React.useContext(ComboboxCtx);
      return (
        <button
          type="button"
          disabled={ctx.disabled === true}
          onClick={() => ctx.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },

    ComboboxContent: Passthrough,
    ComboboxList: Passthrough,
    ComboboxGroup: Passthrough,
    ComboboxLabel: Passthrough,
    ComboboxSeparator: () => null,
  };
}
