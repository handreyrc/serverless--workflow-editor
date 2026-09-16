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
import { Textarea } from "../ui/textarea";
import type { JsonField } from "../../../core/schemaToFormFields";
import { useTaskFormContext, getNestedValue } from "../taskFormContext";
import { useFieldError, FieldWithError } from "./fieldHelpers";

// ---------------------------------------------------------------------------
// StructuredValueField — textarea that stores an arbitrary parsed value
//
// The field stores the *parsed* value (object, array, number, boolean, null)
// in react-hook-form, not a raw string. `field.format` controls how the
// stored value is serialised for display and parsed on blur:
//   "yaml" — display as YAML; parse with js-yaml (accepts YAML and JSON)
//   "json" — display as pretty-printed JSON; parse with JSON.parse only
// If parsing fails the raw text is stored as a plain string so the user
// can keep editing without losing their work.
//
// State design
// ────────────
// The textarea owns its local `text` string independently of RHF's stored
// value. Two external events must reset `text` to the current serialised
// value:
//   1. Task switch / cancel / apply — signalled by `defaultValues` identity
//      change (form.reset() is called in all three cases).
//   2. Format switch (YAML ↔ JSON) — signalled by `field.format` changing.
//
// Importantly, `rhfField.value` is NOT used as a reset signal because RHF
// falls back to `_defaultValues` when `_formValues[name]` is `undefined`.
// This means clearing the field (setting it to undefined) does not change
// `rhfField.value` from the component's perspective — the ref comparison
// would never detect the clear, causing a spurious text restore.
// ---------------------------------------------------------------------------

export type StructuredValueFieldProps = {
  field: JsonField;
  id?: string | undefined;
};

function valueToText(value: unknown, format: "json" | "yaml"): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return format === "json"
      ? JSON.stringify(value, null, 2)
      : dump(value, { indent: 2, lineWidth: -1 }).trimEnd();
  } catch {
    return String(value);
  }
}

function parseText(text: string, format: "json" | "yaml"): unknown {
  if (format === "json") {
    return JSON.parse(text);
  }
  // js-yaml's `load` is a superset of JSON, so YAML format also accepts JSON.
  return load(text);
}

export function StructuredValueField({ field, id }: StructuredValueFieldProps) {
  const { control, getValues, getFieldState } = useFormContext<Record<string, unknown>>();
  const { isReadOnly } = useTaskFormContext();
  const errorMessage = useFieldError(field.path);

  // Watch defaultValues identity: it changes on every form.reset() call,
  // which covers task switch, cancel, and apply. This is the same strategy
  // used by KeyValueMapField to detect external resets reliably.
  const { defaultValues } = useFormState({ control });

  // Local text state — authoritative display value, decoupled from RHF.
  //
  // On mount we determine the initial display based on live value + dirty state:
  //   - getValues(path) returns the current _formValues entry. When the new
  //     Controller mounts after a kind-boundary switch, it restores
  //     _defaultValues into _formValues if the live value was undefined, so the
  //     returned value may be the committed Expression string.
  //   - getFieldState(path).isDirty is true when handleVariantChange or user
  //     interaction explicitly called setValue with shouldDirty:true.
  //
  // Priority order:
  //   1. live is a string AND NOT dirty → stale committed expression restored by
  //      the Controller mount after an Expression→Data kind-boundary switch →
  //      empty textarea (show the Data field blank, not the expression).
  //   2. live is defined AND dirty → restored snapshot from a previous switch →
  //      show the snapshot value (could be an object or even in-progress text).
  //   3. live is undefined AND dirty → cleared without restore → empty textarea.
  //   4. live is not a string AND not dirty → committed structured value → show it.
  //   5. live is undefined AND not dirty → never set → fall back to defaultValues.
  const [text, setText] = React.useState(() => {
    const live = getValues(field.path as never) as unknown;
    const wasDirtied = getFieldState(field.path as never).isDirty;

    // Case 1: stale expression string after Expression→Data kind-boundary switch.
    // The Controller mount restores the expression from _defaultValues into
    // _formValues — the field is NOT dirty since handleVariantChange used
    // shouldDirty:false for the path clear. Show empty to reflect the blank
    // Data textarea the user sees when they switch to the Data variant.
    if (typeof live === "string" && !wasDirtied) {
      return "";
    }

    // Cases 2 & 3: field was explicitly set (snapshot restore or cleared).
    if (wasDirtied) {
      return live !== undefined ? valueToText(live, field.format) : "";
    }

    // Case 4: committed structured value (live was set by Controller mount from defaults).
    if (live !== undefined) {
      return valueToText(live, field.format);
    }

    // Case 5: fall back to defaultValues. If the default is a plain string in a
    // json/yaml field it is an expression value (the committed variant was
    // Expression). Show empty — the user switched to Data and expects a blank
    // structured-value textarea, not the expression text.
    const fromDefault = defaultValues ? getNestedValue(defaultValues, field.path) : undefined;
    if (typeof fromDefault === "string") {
      return "";
    }
    return valueToText(fromDefault, field.format);
  });

  // Re-initialise text when the task changes (defaultValues reset — covers
  // task switch, cancel, and apply) or the user switches format variant.
  // useEffect fires after commit, so the values are always settled.
  // `field.format` is included so switching YAML ↔ JSON re-serialises the
  // current default value in the new format.
  //
  // Use a ref-based identity check instead of an isMountedRef flag.
  // isMountedRef.current is set to true on the first effect run, but React
  // Strict Mode (development) intentionally double-invokes effects on the
  // same component instance. The second invocation sees isMountedRef=true
  // and fires setText with the stale defaultValues, overwriting the
  // correctly-cleared textarea that the useState initialiser set.
  //
  // The ref-equality guard fires only when defaultValues actually changes
  // (form.reset, task switch, cancel). On the first effect run (mount),
  // prevDefaultValuesRef === defaultValues, so it is a no-op. In Strict
  // Mode's second invocation the ref is still equal to defaultValues, so
  // it is also a no-op. ✓
  const prevDefaultValuesRef = React.useRef(defaultValues);
  const prevFormatRef = React.useRef(field.format);
  const prevPathRef = React.useRef(field.path);
  React.useEffect(() => {
    const formatOrPathChanged =
      field.format !== prevFormatRef.current || field.path !== prevPathRef.current;
    if (defaultValues === prevDefaultValuesRef.current && !formatOrPathChanged) return;
    prevDefaultValuesRef.current = defaultValues;
    prevFormatRef.current = field.format;
    prevPathRef.current = field.path;
    // Mirror the useState initialiser guard: if the default is a plain string
    // in a json/yaml field it means the committed variant was Expression, so
    // show an empty textarea — the user switched to Data and the expression
    // text must not bleed through.
    const fromDefault = defaultValues ? getNestedValue(defaultValues, field.path) : undefined;
    if (typeof fromDefault === "string") {
      setText("");
      return;
    }
    setText(valueToText(fromDefault, field.format));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues, field.format, field.path]);

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => {
        // Push the parsed value into RHF on every keystroke so the form is
        // always up to date — Apply does not trigger blur, so waiting until
        // blur to call onChange would lose edits that haven't been blurred.
        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
          const raw = e.target.value;
          setText(raw);
          const trimmed = raw.trim();
          if (trimmed === "") {
            rhfField.onChange("");
            return;
          }
          try {
            rhfField.onChange(parseText(trimmed, field.format));
          } catch {
            // Not valid yet — keep the raw string so RHF reflects the
            // in-progress edit without losing it.
            rhfField.onChange(trimmed);
          }
        };

        return (
          <FieldWithError errorMessage={errorMessage}>
            <Textarea
              id={id}
              value={text}
              onChange={handleChange}
              onBlur={rhfField.onBlur}
              disabled={isReadOnly}
              readOnly={isReadOnly}
              className="dec-form-scrollable-textarea dec-form-structured-value-textarea"
              aria-invalid={errorMessage !== undefined || undefined}
            />
          </FieldWithError>
        );
      }}
    />
  );
}
