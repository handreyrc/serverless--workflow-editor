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
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FormFieldDescriptor, ObjectField, OneOfField } from "./schemaToFormFields";
import { FieldControl } from "./FieldControl";
import { useTaskFormContext, filterReadOnlyFields, getNestedValue } from "./taskFormContext";
import { Select } from "@/components/ui/select";

// ---------------------------------------------------------------------------
// FormField — single form row (label + optional tooltip + control)
// ---------------------------------------------------------------------------

export type FormFieldProps = {
  field: FormFieldDescriptor;
};

export function FormField({ field }: FormFieldProps) {
  if (field.kind === "object") {
    return <ObjectFieldRow field={field} />;
  }
  if (field.kind === "one-of") {
    return <OneOfFieldRow field={field} />;
  }

  return (
    <div className="dec-form-field">
      <FieldLabel
        label={field.label}
        required={field.required}
        {...(field.description !== undefined ? { description: field.description } : {})}
      />
      <div className="dec-form-field-control">
        <FieldControl field={field} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldLabel — label text + optional description tooltip
// ---------------------------------------------------------------------------

function FieldLabel({
  label,
  required,
  description,
}: {
  label: string;
  required: boolean;
  description?: string;
}) {
  return (
    <div className="dec-form-field-label-row">
      <label className="dec-form-field-label">
        {label}
        {required && (
          <span className="dec-form-field-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {description && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="dec-form-field-help"
              aria-label={`Help: ${label}`}
              tabIndex={0}
            >
              <HelpCircle className="dec-form-field-help-icon" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ObjectFieldRow — collapsible group for object fields with sub-properties
// ---------------------------------------------------------------------------

function ObjectFieldRow({ field }: { field: ObjectField }) {
  const [expanded, setExpanded] = React.useState(true);
  const { isReadOnly, taskData } = useTaskFormContext();

  const visibleChildren = isReadOnly
    ? filterReadOnlyFields(field.children, taskData)
    : field.children;

  // In read-only mode collapse the whole group if nothing inside has a value
  if (isReadOnly && visibleChildren.length === 0) return null;

  return (
    <div className="dec-form-object-group">
      <button
        type="button"
        className="dec-form-object-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="dec-form-object-chevron" aria-hidden="true" />
        ) : (
          <ChevronRight className="dec-form-object-chevron" aria-hidden="true" />
        )}
        <span className="dec-form-object-label">{field.label}</span>
        {field.required && (
          <span className="dec-form-field-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {field.description !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dec-form-field-help"
                aria-label={`Help: ${field.label}`}
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
              >
                <HelpCircle className="dec-form-field-help-icon" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{field.description}</TooltipContent>
          </Tooltip>
        )}
      </button>

      {expanded && (
        <div className="dec-form-object-children">
          {visibleChildren.map((child) => (
            <FormField key={child.path} field={child} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OneOfFieldRow — type-selector combobox + sub-fields for selected variant
// ---------------------------------------------------------------------------

function OneOfFieldRow({ field }: { field: OneOfField }) {
  const { isReadOnly, taskData } = useTaskFormContext();

  // Derive the initial variant index from the actual task data in both modes.
  const derivedIdx = React.useMemo(() => {
    // For the root one-of the relevant data is the whole task object;
    // for property-level one-ofs it's the value at the field's path.
    const dataAtPath = field.path === "__root__" ? taskData : getNestedValue(taskData, field.path);
    const idx = field.variants.findIndex((v) => v.matchesData(dataAtPath));
    return idx === -1 ? 0 : idx;
  }, [field.path, field.variants, taskData]);

  const [selectedVariantIdx, setSelectedVariantIdx] = React.useState(derivedIdx);

  // Re-sync when the selected task changes (taskData identity changes).
  React.useEffect(() => {
    setSelectedVariantIdx(derivedIdx);
  }, [derivedIdx]);

  const variantLabels = field.variants.map((v) => v.label);
  const currentVariant = field.variants[selectedVariantIdx];

  const visibleVariantFields = React.useMemo(() => {
    if (!currentVariant) return [];
    if (!isReadOnly) return currentVariant.fields;
    return filterReadOnlyFields(currentVariant.fields, taskData);
  }, [currentVariant, isReadOnly, taskData]);

  return (
    <div className="dec-form-oneof-group">
      <div className="dec-form-field">
        <FieldLabel
          label={field.label}
          required={field.required}
          {...(field.description !== undefined ? { description: field.description } : {})}
        />
        <div className="dec-form-field-control">
          <Select
            value={variantLabels[selectedVariantIdx] ?? ""}
            onChange={(e) => {
              const idx = variantLabels.indexOf(e.target.value);
              if (idx !== -1) setSelectedVariantIdx(idx);
            }}
            disabled={isReadOnly}
            aria-label={field.label}
          >
            {variantLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {visibleVariantFields.length > 0 && (
        <div className="dec-form-oneof-children">
          {visibleVariantFields.map((child) => (
            <FormField key={child.path} field={child} />
          ))}
        </div>
      )}
    </div>
  );
}
