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

import type { DetailField } from "@/core/taskDetails";
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@openworkflowspec/i18n";

/**
 * These controls are read only presentation of a field and are always disabled.
 */
type ControlProps<K extends DetailField["kind"]> = {
  field: Extract<DetailField, { kind: K }>;
};

const ISO_8601_DURATION_REGEX =
  /^P(?=\d|T)(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/;

function LongStringControl({ field }: ControlProps<"long-string">) {
  return <Textarea value={field.value} readOnly disabled />;
}

function DurationControl({ field }: ControlProps<"duration">) {
  const { t } = useI18n();
  return (
    <Input
      value={field.value}
      pattern={ISO_8601_DURATION_REGEX.source}
      title={t("sidebar.duration.title")}
      disabled
    />
  );
}

function ExpressionControl({ field }: ControlProps<"runtime-expression">) {
  return (
    <div>
      <span className="dec-sidebar-hint-text">Runtime expression</span>
      <Input value={field.value} disabled />
    </div>
  );
}

function EnumControl({ field }: ControlProps<"enum">) {
  return (
    <Combobox value={field.value} disabled>
      <ComboboxTrigger>
        <ComboboxValue placeholder="Select an option" />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxList>
          {field.options.map((option) => (
            <ComboboxItem key={option} value={option}>
              {option}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function TextControl({ value }: { value: string }) {
  return <Input value={value} disabled />;
}

function NumberControl({ value }: { value: number }) {
  return <Input type="number" value={value} disabled />;
}

function BooleanControl({ value }: { value: boolean }) {
  return <Switch checked={value} disabled />;
}

export function FieldControl({ field }: { field: DetailField }) {
  const { t } = useI18n();

  switch (field.kind) {
    case "long-string":
      return <LongStringControl field={field} />;

    case "duration":
      return <DurationControl field={field} />;

    case "runtime-expression":
      return <ExpressionControl field={field} />;

    case "enum":
      return <EnumControl field={field} />;

    case "scalar":
      if (typeof field.value === "string") {
        return <TextControl value={field.value} />;
      }

      if (typeof field.value === "number") {
        return <NumberControl value={field.value} />;
      }

      if (typeof field.value === "boolean") {
        return <BooleanControl value={field.value} />;
      }

      return String(field.value);

    case "array":
      return `${field.count} ${t(
        field.count === 1 ? "sidebar.field.item" : "sidebar.field.items",
      )}`;

    case "object":
      return <>{"{...}"}</>;
  }
}
