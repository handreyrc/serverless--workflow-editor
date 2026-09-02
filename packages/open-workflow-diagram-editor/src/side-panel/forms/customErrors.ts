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

import type { TranslationKeys } from "@/i18n/locales/en";

// ---------------------------------------------------------------------------
// FormErrors
// ---------------------------------------------------------------------------

/**
 * Locale-aware form validation error message helpers.
 *
 * Call `buildFormErrors(t)` once per render cycle (inside a hook or useMemo)
 * and pass the result down to `buildTaskFormResolver`.  Each method formats
 * one category of error using the i18n `t` function so the messages follow
 * the active editor locale.
 *
 * The `t` function accepts a `TranslationKeys` key.  Because the locale
 * strings use `{placeholder}` tokens, a simple inline replace handles
 * interpolation without requiring a separate i18n interpolation layer.
 */
export type FormErrors = {
  required: (field: string) => string;
  mustBeNumber: (field: string) => string;
  mustBeBoolean: (field: string) => string;
  mustBeOneOf: (field: string, options: string[]) => string;
  mustBeDuration: (field: string) => string;
};

type TFn = (key: TranslationKeys) => string;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export function buildFormErrors(t: TFn): FormErrors {
  return {
    required: (field) => interpolate(t("form.error.required"), { field }),
    mustBeNumber: (field) => interpolate(t("form.error.mustBeNumber"), { field }),
    mustBeBoolean: (field) => interpolate(t("form.error.mustBeBoolean"), { field }),
    mustBeOneOf: (field, options) =>
      interpolate(t("form.error.mustBeOneOf"), { field, options: options.join(", ") }),
    mustBeDuration: (field) => interpolate(t("form.error.mustBeDuration"), { field }),
  };
}
