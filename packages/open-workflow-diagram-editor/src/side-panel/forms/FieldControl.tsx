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
import { Controller, useFormContext, useFormState, get } from "react-hook-form";
import { useI18n } from "@openworkflowspec/i18n";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import type {
  FormFieldDescriptor,
  BooleanField,
  EnumField,
  NumberField,
  StringField,
  ThenField,
  ChildTaskListField,
  DurationField,
} from "./schemaToFormFields";
import { useTaskFormContext } from "./taskFormContext";

// ---------------------------------------------------------------------------
// Helper: resolve field-level error message from RHF form state
// ---------------------------------------------------------------------------

function useFieldError(path: string): string | undefined {
  const { errors } = useFormState<Record<string, unknown>>();
  // RHF stores errors as nested objects even when field names use dot-notation
  // (e.g. "with.method" is stored at errors.with.method, not errors["with.method"]).
  // Use RHF's own `get()` helper to traverse the nested path correctly.
  const error = get(errors, path) as { message?: string } | undefined;
  return error?.message;
}

// ---------------------------------------------------------------------------
// FieldWithError — wraps a control and shows an inline error message beneath
// ---------------------------------------------------------------------------

function FieldWithError({
  errorMessage,
  children,
}: {
  errorMessage: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="dec-form-field-input-wrap">
      {children}
      {errorMessage !== undefined && (
        <p className="dec-form-field-error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ISO 8601 duration regex
// ---------------------------------------------------------------------------
const ISO_8601_DURATION_PATTERN =
  "^P(?!$)(\\d+(?:\\.\\d+)?Y)?(\\d+(?:\\.\\d+)?M)?(\\d+(?:\\.\\d+)?W)?(\\d+(?:\\.\\d+)?D)?(T(?=\\d)(\\d+(?:\\.\\d+)?H)?(\\d+(?:\\.\\d+)?M)?(\\d+(?:\\.\\d+)?S)?)?$";

// ---------------------------------------------------------------------------
// FieldControl dispatcher
// ---------------------------------------------------------------------------

export type FieldControlProps = {
  field: Exclude<FormFieldDescriptor, { kind: "object" } | { kind: "one-of" }>;
};

export function FieldControl({ field }: FieldControlProps) {
  switch (field.kind) {
    case "string":
      return <StringControl field={field} />;
    case "number":
      return <NumberControl field={field} />;
    case "boolean":
      return <BooleanControl field={field} />;
    case "enum":
      return <EnumControl field={field} />;
    case "duration":
      return <DurationControl field={field} />;
    case "then":
      return <ThenControl field={field} />;
    case "child-task-list":
      return <ChildTaskListControl field={field} />;
  }
}

// ---------------------------------------------------------------------------
// StringControl
// ---------------------------------------------------------------------------

function StringControl({ field }: { field: StringField }) {
  const { control } = useFormContext<Record<string, unknown>>();
  const { isReadOnly } = useTaskFormContext();
  const errorMessage = useFieldError(field.path);

  const placeholder = field.isRuntimeExpression ? "${...}" : undefined;

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => {
        const strValue = rhfField.value == null ? "" : String(rhfField.value);
        if (field.multiline) {
          return (
            <FieldWithError errorMessage={errorMessage}>
              <Textarea
                {...rhfField}
                value={strValue}
                disabled={isReadOnly}
                readOnly={isReadOnly}
                placeholder={placeholder}
                aria-invalid={errorMessage !== undefined || undefined}
              />
            </FieldWithError>
          );
        }
        return (
          <FieldWithError errorMessage={errorMessage}>
            <Input
              {...rhfField}
              value={strValue}
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

// ---------------------------------------------------------------------------
// NumberControl
// ---------------------------------------------------------------------------

function NumberControl({ field }: { field: NumberField }) {
  const { control } = useFormContext<Record<string, unknown>>();
  const { isReadOnly } = useTaskFormContext();
  const errorMessage = useFieldError(field.path);

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => (
        <FieldWithError errorMessage={errorMessage}>
          <Input
            type="number"
            value={rhfField.value == null ? "" : String(rhfField.value)}
            onChange={(e) =>
              rhfField.onChange(e.target.value === "" ? undefined : Number(e.target.value))
            }
            onBlur={rhfField.onBlur}
            name={rhfField.name}
            disabled={isReadOnly}
            readOnly={isReadOnly}
            aria-invalid={errorMessage !== undefined || undefined}
          />
        </FieldWithError>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// BooleanControl
// ---------------------------------------------------------------------------

function BooleanControl({ field }: { field: BooleanField }) {
  const { control } = useFormContext<Record<string, unknown>>();
  const { isReadOnly } = useTaskFormContext();

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => (
        <Switch
          checked={!!rhfField.value}
          {...(!isReadOnly ? { onCheckedChange: rhfField.onChange } : {})}
          disabled={isReadOnly}
          aria-label={field.label}
        />
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// EnumControl
// ---------------------------------------------------------------------------

function EnumControl({ field }: { field: EnumField }) {
  const { control } = useFormContext<Record<string, unknown>>();
  const { isReadOnly } = useTaskFormContext();
  const { t } = useI18n();
  const errorMessage = useFieldError(field.path);

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => (
        <FieldWithError errorMessage={errorMessage}>
          <Select
            value={(rhfField.value as string) ?? ""}
            onChange={!isReadOnly ? (e) => rhfField.onChange(e.target.value) : undefined}
            onBlur={rhfField.onBlur}
            name={rhfField.name}
            disabled={isReadOnly}
            aria-label={field.label}
            aria-invalid={errorMessage !== undefined || undefined}
          >
            {!rhfField.value && (
              <option value="" disabled>
                {t("sidebar.form.selectOption")}
              </option>
            )}
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </FieldWithError>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// DurationControl
// ---------------------------------------------------------------------------

function DurationControl({ field }: { field: DurationField }) {
  const { control } = useFormContext<Record<string, unknown>>();
  const { isReadOnly } = useTaskFormContext();
  const { t } = useI18n();
  const errorMessage = useFieldError(field.path);

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => (
        <FieldWithError errorMessage={errorMessage}>
          <Input
            value={rhfField.value == null ? "" : String(rhfField.value)}
            onChange={rhfField.onChange}
            onBlur={rhfField.onBlur}
            name={rhfField.name}
            pattern={ISO_8601_DURATION_PATTERN}
            title={t("sidebar.duration.title")}
            disabled={isReadOnly}
            readOnly={isReadOnly}
            placeholder="PT30S"
            aria-invalid={errorMessage !== undefined || undefined}
          />
        </FieldWithError>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// ThenControl — combobox of sibling task names in the same scope
// ---------------------------------------------------------------------------

function ThenControl({ field }: { field: ThenField }) {
  const { control } = useFormContext<Record<string, unknown>>();
  const { isReadOnly, siblingTaskNames } = useTaskFormContext();
  const errorMessage = useFieldError(field.path);

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => (
        <FieldWithError errorMessage={errorMessage}>
          <Select
            value={(rhfField.value as string) ?? ""}
            onChange={!isReadOnly ? (e) => rhfField.onChange(e.target.value) : undefined}
            onBlur={rhfField.onBlur}
            name={rhfField.name}
            disabled={isReadOnly}
            aria-label={field.label}
            aria-invalid={errorMessage !== undefined || undefined}
          >
            <option value="">—</option>
            {siblingTaskNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </FieldWithError>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// ChildTaskListControl — read-only list of child task names
// ---------------------------------------------------------------------------

function ChildTaskListControl({ field }: { field: ChildTaskListField }) {
  const { control } = useFormContext<Record<string, unknown>>();

  return (
    <Controller
      name={field.path}
      control={control}
      render={({ field: rhfField }) => {
        const list = rhfField.value;
        if (!Array.isArray(list) || list.length === 0) {
          return <span className="dec-form-child-list-empty">—</span>;
        }
        const names = list
          .map((entry) => (entry && typeof entry === "object" ? Object.keys(entry)[0] : undefined))
          .filter(Boolean) as string[];

        return (
          <ul className="dec-form-child-list">
            {names.map((name) => (
              <li key={name} className="dec-form-child-list-item">
                {name}
              </li>
            ))}
          </ul>
        );
      }}
    />
  );
}
