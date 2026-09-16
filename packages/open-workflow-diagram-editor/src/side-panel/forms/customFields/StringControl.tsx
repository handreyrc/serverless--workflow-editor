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
import { Input } from "../ui/input";
import type { StringField } from "../../../core/schemaToFormFields";
import { useTaskFormContext } from "../taskFormContext";
import { useFieldError, FieldWithError } from "./fieldHelpers";
import { ScrollableTextField } from "./ScrollableTextField";

// ---------------------------------------------------------------------------
// StringControl — single-line or multiline string input
//
// State design (mirrors StructuredValueField)
// ────────────────────────────────────────────
// When a OneOf switches between two string variants at the same path (e.g.
// URI ↔ Expression in `source`), handleVariantChange calls
//   setValue(path, undefined, { shouldDirty: false })
// to clear the stale value. React then unmounts the old variant's StringControl
// and mounts the new one. On mount, RHF's Controller restores `_defaultValues`
// into `_formValues` when the live value is `undefined`, so `rhfField.value`
// shows the committed value of the *other* variant — leaking it into the field.
//
// The fix uses the same getValues(path) + isDirty guard pattern as
// StructuredValueField. Two cases on mount:
//   • live is a string AND NOT dirty AND it belongs to the wrong variant
//     (RE string in a URI field or vice versa) → stale defaultValues restoration
//     after a kind-boundary switch → show empty (Case 1).
//   • anything else → show the live value if it is a string, otherwise empty
//     (covers snapshot restores, explicit clears, and normal task opens).
//
// The local `inputValue` state is reset whenever `defaultValues` identity
// changes (task switch, cancel, apply) or the field path/kind changes.
// ---------------------------------------------------------------------------

export type StringControlProps = {
  field: StringField;
  id?: string;
};

export function StringControl({ field, id }: StringControlProps) {
  // Multiline strings are handled by the dedicated scrollable custom field.
  if (field.multiline) {
    return <ScrollableTextField field={field} {...(id !== undefined ? { id } : {})} />;
  }

  return <SingleLineStringControl field={field} {...(id !== undefined ? { id } : {})} />;
}

function SingleLineStringControl({ field, id }: StringControlProps) {
  const { control, getValues, getFieldState } = useFormContext<Record<string, unknown>>();
  const { isReadOnly } = useTaskFormContext();
  const errorMessage = useFieldError(field.path);
  const { defaultValues } = useFormState({ control });

  const placeholder = field.placeholder ?? (field.isRuntimeExpression ? "${...}" : undefined);

  // Compute the initial display value.
  //
  // The only special case is when the live value is a string that belongs to the
  // wrong variant (e.g. a URI in an Expression slot or vice versa). That happens
  // when handleVariantChange cleared the path (shouldDirty:false) and RHF's
  // Controller mount restored _defaultValues into _formValues. The field is not
  // dirty, so we detect the mismatch via the RE pattern and show empty instead.
  // All other situations — snapshot restores (dirty), explicit clears (dirty),
  // and normal task opens (not dirty, correct variant) — fall through to showing
  // the live value directly.
  const [inputValue, setInputValue] = React.useState<string>(() => {
    const live = getValues(field.path as never) as unknown;
    const wasDirtied = getFieldState(field.path as never).isDirty;
    // Stale defaultValues restoration after a kind-boundary switch: the live value
    // equals defaultValues (Controller restored it on mount), the field is not dirty,
    // and the value semantically belongs to the other variant. Show empty.
    if (typeof live === "string" && !wasDirtied) {
      const isRe = /^\s*\$\{.+\}\s*$/.test(live);
      if (isRe !== field.isRuntimeExpression) {
        return "";
      }
    }
    // All other cases: show the live string value, or empty if not a string.
    return typeof live === "string" ? live : "";
  });

  // Reset when the task changes (defaultValues identity) or path/isRuntimeExpression changes.
  // Uses the same ref-equality guard as StructuredValueField to be a no-op on
  // mount and in React Strict Mode's second invocation.
  const prevDefaultValuesRef = React.useRef(defaultValues);
  const prevPathRef = React.useRef(field.path);
  const prevIsReRef = React.useRef(field.isRuntimeExpression);
  React.useEffect(() => {
    const pathOrKindChanged =
      field.path !== prevPathRef.current || field.isRuntimeExpression !== prevIsReRef.current;
    if (defaultValues === prevDefaultValuesRef.current && !pathOrKindChanged) return;
    prevDefaultValuesRef.current = defaultValues;
    prevPathRef.current = field.path;
    prevIsReRef.current = field.isRuntimeExpression;
    // Re-derive from the new task state — same logic as the useState initialiser.
    const live = getValues(field.path as never) as unknown;
    const wasDirtied = getFieldState(field.path as never).isDirty;
    if (typeof live === "string" && !wasDirtied) {
      const isRe = /^\s*\$\{.+\}\s*$/.test(live);
      if (isRe !== field.isRuntimeExpression) {
        setInputValue("");
        return;
      }
    }
    setInputValue(typeof live === "string" ? live : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues, field.path, field.isRuntimeExpression]);

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const val = e.target.value;
          setInputValue(val);
          rhfField.onChange(val);
        };

        return (
          <FieldWithError errorMessage={errorMessage}>
            <Input
              id={id}
              value={inputValue}
              onChange={handleChange}
              onBlur={rhfField.onBlur}
              disabled={isReadOnly}
              readOnly={isReadOnly}
              placeholder={placeholder}
              className={field.isRuntimeExpression ? "dec-form-expression-input" : undefined}
              aria-invalid={errorMessage !== undefined || undefined}
            />
          </FieldWithError>
        );
      }}
    />
  );
}
