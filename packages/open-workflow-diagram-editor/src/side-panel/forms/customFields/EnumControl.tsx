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
import { Controller, useFormContext, useFormState } from "react-hook-form";
import { dump, load } from "js-yaml";
import { useI18n } from "@openworkflowspec/i18n";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "../ui/combobox";
import type { EnumField, ContentFormat } from "../../../core/schemaToFormFields";
import { useTaskFormContext, getNestedValue } from "../taskFormContext";
import { useFieldError, FieldWithError } from "./fieldHelpers";
import { Textarea } from "../ui/textarea";

// ---------------------------------------------------------------------------
// Module-level store for inner object text
// ---------------------------------------------------------------------------

/**
 * Maps a field path to the current serialised text of its inner object.
 * Allows EditFormFooter's handleApply to read the inner content without going
 * through RHF (which would require a nested Controller that interferes with
 * dirty-field tracking).
 */
const innerObjectTextStore = new Map<string, string>();

/**
 * Inner-object texts stashed per option, restored when switching back to that option. Keyed by
 * the form's `defaultValues`, whose identity changes on every `form.reset()` (Apply, Cancel, node
 * switch, undo), so a reset discards the stash while a drill, which unmounts the row without
 * resetting, keeps it.
 */
const stashedInnerTexts = new WeakMap<object, Map<string, string>>();
const NO_DEFAULTS = {};

function stashFor(defaultValues: object | undefined): Map<string, string> {
  const owner = defaultValues ?? NO_DEFAULTS;
  let stash = stashedInnerTexts.get(owner);
  if (stash === undefined) {
    stash = new Map();
    stashedInnerTexts.set(owner, stash);
  }
  return stash;
}

const stashKey = (path: string, optionKey: string) => `${path}\u0000${optionKey}`;

/**
 * Parses the inner object text stored for a given field path.
 *
 * Returns:
 *  - `{}` when the path is not in the store or the text is empty (intentional empty payload).
 *  - A parsed `Record<string, unknown>` when the text is valid and produces a plain object.
 *  - `null` when the text is non-empty but fails to parse or produces a non-object value
 *    (e.g. malformed JSON/YAML, a bare scalar). Callers must not commit a `null` result.
 */
export function getInnerObjectForPath(
  path: string,
  format: ContentFormat,
): Record<string, unknown> | null {
  const text = innerObjectTextStore.get(path);
  if (!text || text.trim() === "") return {};
  try {
    const parsed = format === "json" ? JSON.parse(text) : (load(text) as unknown);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    // Valid parse but not a plain object (e.g. array, scalar) — treat as failure.
    return null;
  } catch {
    // Malformed input — propagate failure explicitly.
    return null;
  }
}

/**
 * Inner object payload for a valueMap-backed enum selection.
 * Returns `{}` when no key is selected or the field has no inner object format,
 * and `null` when the stored payload text cannot be parsed.
 */
export function getValueMapInnerObject(
  field: EnumField,
  key: string,
): Record<string, unknown> | null {
  return key && field.innerObjectFormat !== undefined
    ? getInnerObjectForPath(field.path, field.innerObjectFormat)
    : {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derives the display key from a field value, supporting both plain strings
 *  and discriminator objects (valueMap mode). */
function deriveSelectedKey(value: unknown, hasValueMap: boolean): string {
  if (hasValueMap && value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)[0] ?? "";
  }
  return (value as string | undefined) ?? "";
}

/** Extracts the inner object from a discriminator value. */
function deriveInnerObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const key = Object.keys(obj)[0];
    if (key !== undefined) {
      const inner = obj[key];
      return inner !== null && typeof inner === "object" && !Array.isArray(inner)
        ? (inner as Record<string, unknown>)
        : {};
    }
  }
  return {};
}

function serializeInnerObject(obj: Record<string, unknown>, format: "yaml" | "json"): string {
  if (Object.keys(obj).length === 0) return "";
  try {
    return format === "json"
      ? JSON.stringify(obj, null, 2)
      : dump(obj, { indent: 2, lineWidth: -1 }).trimEnd();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// EnumControl — combobox selector backed by react-hook-form
// ---------------------------------------------------------------------------

export type EnumControlProps = {
  field: EnumField;
  id?: string;
};

export function EnumControl({ field, id }: EnumControlProps) {
  const { control, getValues } = useFormContext<Record<string, unknown>>();
  const { isReadOnly, taskData, validateField } = useTaskFormContext();
  const { t } = useI18n();
  const errorMessage = useFieldError(field.path);
  const hasValueMap = field.valueMap !== undefined;
  const hasInnerObject = field.innerObjectFormat !== undefined;

  // Local selected-key state for valueMap fields.
  const [selectedKey, setSelectedKey] = React.useState<string>(() => {
    if (!hasValueMap) return "";
    const rhfValue = getValues(field.path as never) as unknown;
    if (rhfValue !== undefined && rhfValue !== null)
      return deriveSelectedKey(rhfValue, hasValueMap);
    return deriveSelectedKey(getNestedValue(taskData, field.path), hasValueMap);
  });

  // Local inner-object text state.  Only populated when innerObjectFormat is set.
  const [innerText, setInnerText] = React.useState<string>(() => {
    if (!hasInnerObject) return "";

    const rhfValue = getValues(field.path as never) as unknown;
    if (typeof rhfValue === "string" && rhfValue !== "") {
      const stored = innerObjectTextStore.get(field.path);
      if (stored !== undefined) return stored;
    }

    const fromValue =
      rhfValue !== undefined && rhfValue !== null ? rhfValue : getNestedValue(taskData, field.path);
    const innerObj = deriveInnerObject(fromValue);
    const text = serializeInnerObject(innerObj, field.innerObjectFormat ?? "yaml");
    innerObjectTextStore.set(field.path, text);
    return text;
  });

  // Re-sync when the form resets (apply, cancel, node switch, undo/redo).
  // defaultValues identity changes on every form.reset() call.
  // Track the previous snapshot in state (not a ref) so the state derivation can happen
  // during render without triggering react(set-state-in-effect).
  const { defaultValues } = useFormState({ control });
  const [prevDefaultValues, setPrevDefaultValues] = React.useState(defaultValues);
  if (hasValueMap && prevDefaultValues !== defaultValues) {
    setPrevDefaultValues(defaultValues);
    const fromDefault = getNestedValue(
      (defaultValues as Record<string, unknown>) ?? {},
      field.path,
    );
    setSelectedKey(deriveSelectedKey(fromDefault, hasValueMap));
    if (hasInnerObject) {
      const innerObj = deriveInnerObject(fromDefault);
      const text = serializeInnerObject(innerObj, field.innerObjectFormat ?? "yaml");
      setInnerText(text);
      innerObjectTextStore.set(field.path, text);
    }
  }

  // Keep the store up-to-date whenever innerText changes.
  React.useEffect(() => {
    if (!hasInnerObject) return;
    innerObjectTextStore.set(field.path, innerText);
  }, [field.path, hasInnerObject, innerText]);

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => {
        // For plain string enums derive the display key directly from rhfField.value.
        // For valueMap enums use the local state kept in sync with resets.
        const displayKey = hasValueMap
          ? selectedKey
          : ((rhfField.value as string | undefined) ?? "");

        function handleValueChange(val: string | null) {
          // Always store the plain string key in RHF — storing an object breaks
          // RHF's dirty-field tracking (dirtyFields ends up empty for object-valued
          // Controllers). The valueMap→object conversion happens in handleApply.
          // For valueMap enums, store "" (not undefined) when clearing: RHF
          // treats undefined as "use defaultValue" and silently falls back to
          // the original discriminator object, making the clear invisible to
          // handleApply.
          // For valueMap enums, store "" (not null/undefined) when clearing so RHF
          // can detect the change. For plain enums, store undefined when clearing so
          // the field is removed rather than set to an empty string.
          rhfField.onChange(
            hasValueMap ? (val ?? "") : val !== null && val !== "" ? val : undefined,
          );
          if (hasValueMap) {
            if (hasInnerObject) {
              // Stash the current inner text before switching so it can be
              // restored if the user switches back (same pattern as
              // savedVariantValues in OneOfFieldRow).
              const stash = stashFor(defaultValues);
              if (selectedKey) {
                stash.set(stashKey(field.path, selectedKey), innerText);
              }
              const restored = stash.get(stashKey(field.path, val ?? ""));
              const newText = restored ?? "";
              setInnerText(newText);
              innerObjectTextStore.set(field.path, newText);
            }
            setSelectedKey(val ?? "");
          }
          validateField?.(field.path);
        }

        function handleInnerTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
          const text = e.target.value;
          setInnerText(text);
          innerObjectTextStore.set(field.path, text);
          // Ensure the Controller is dirty when only the inner text changes.
          // Re-writing the same string key triggers RHF's dirty comparison:
          // the string differs from the default (which is an object), so the
          // field is marked dirty.
          if (typeof rhfField.value !== "string") {
            rhfField.onChange(displayKey || undefined);
          }
        }

        const showInnerTextarea = hasInnerObject && displayKey !== "";

        return (
          <>
            <FieldWithError errorMessage={!showInnerTextarea ? errorMessage : undefined}>
              <Combobox
                value={displayKey}
                onValueChange={!isReadOnly ? handleValueChange : undefined}
                disabled={isReadOnly}
              >
                <ComboboxInput
                  id={id}
                  readOnly
                  value={
                    displayKey ||
                    (field.defaultValue !== undefined
                      ? `${field.defaultValue} ${t("sidebar.form.default")}`
                      : field.required
                        ? t("sidebar.form.selectOption")
                        : "—")
                  }
                  onBlur={() => {
                    rhfField.onBlur();
                    validateField?.(field.path);
                  }}
                  name={rhfField.name}
                  aria-label={field.label}
                  aria-invalid={errorMessage !== undefined || undefined}
                  showClear={false}
                  className="dec:h-7 dec:text-xs"
                />
                <ComboboxContent>
                  <ComboboxList>
                    {!field.required && <ComboboxItem value="">—</ComboboxItem>}
                    {field.options.map((opt) => (
                      <ComboboxItem key={opt} value={opt}>
                        {opt}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </FieldWithError>
            {showInnerTextarea && (
              <FieldWithError errorMessage={errorMessage}>
                <Textarea
                  value={innerText}
                  onChange={!isReadOnly ? handleInnerTextChange : undefined}
                  onBlur={() => {
                    rhfField.onBlur();
                    validateField?.(field.path);
                  }}
                  disabled={isReadOnly}
                  readOnly={isReadOnly}
                  className="dec-form-scrollable-textarea dec-form-structured-value-textarea"
                  aria-invalid={errorMessage !== undefined || undefined}
                  aria-label={displayKey}
                />
              </FieldWithError>
            )}
          </>
        );
      }}
    />
  );
}
