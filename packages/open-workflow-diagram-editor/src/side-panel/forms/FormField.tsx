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
import { useFormContext } from "react-hook-form";
import { useI18n } from "@openworkflowspec/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FormFieldDescriptor, ObjectField, OneOfField } from "../../core/schemaToFormFields";
import { FieldControl } from "./FieldControl";
import { useTaskFormContext, filterReadOnlyFields, getNestedValue } from "./taskFormContext";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "./ui/combobox";
import { KeyValueMapField } from "./customFields/KeyValueMapField";

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
  if (field.kind === "map") {
    return <KeyValueMapField field={field} />;
  }

  // Boolean controls render as <button role="switch"> — htmlFor→<button> is
  // not a valid DOM association. Skip the id linkage for booleans.
  const controlId =
    field.kind === "boolean" ? undefined : `field-${field.path.replace(/\./g, "-")}`;

  return (
    <div className="dec-form-field">
      <FieldLabel
        {...(controlId !== undefined ? { htmlFor: controlId } : {})}
        label={field.label}
        required={field.required}
        {...(field.description !== undefined ? { description: field.description } : {})}
      />
      <div className="dec-form-field-control">
        <FieldControl field={field} {...(controlId !== undefined ? { id: controlId } : {})} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldLabel — label text + optional description tooltip
// ---------------------------------------------------------------------------

function FieldLabel({
  htmlFor,
  label,
  required,
  description,
}: {
  htmlFor?: string;
  label: string;
  required: boolean;
  description?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="dec-form-field-label-row">
      <label htmlFor={htmlFor} className="dec-form-field-label">
        {label}
      </label>
      {/* Required indicator sits outside the <label> so it is excluded from
          the accessible name computation (getByLabelText matches label text only). */}
      {required && (
        <span className="dec-form-field-required" aria-hidden="true">
          *
        </span>
      )}
      {description && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="dec-form-field-help"
              aria-label={`${t("aria.help")}: ${label}`}
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
  const { t } = useI18n();

  const visibleChildren = isReadOnly
    ? filterReadOnlyFields(field.children, taskData)
    : field.children;

  // In read-only mode collapse the whole group if nothing inside has a value
  if (isReadOnly && visibleChildren.length === 0) return null;

  return (
    <div className="dec-form-object-group">
      {/* Header row: expand/collapse button and optional help button are siblings
          so that no interactive element is nested inside another. */}
      <div className="dec-form-object-header">
        <button
          type="button"
          className="dec-form-object-toggle"
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
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
        </button>
        {field.description !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dec-form-field-help"
                aria-label={`${t("aria.help")}: ${field.label}`}
              >
                <HelpCircle className="dec-form-field-help-icon" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{field.description}</TooltipContent>
          </Tooltip>
        )}
      </div>

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
  // Using a during-render state update avoids the set-state-in-effect lint rule
  // while preserving the correct behaviour: when derivedIdx changes (i.e. a
  // different task is selected) the variant resets before the next paint.
  const [prevDerivedIdx, setPrevDerivedIdx] = React.useState(derivedIdx);
  if (derivedIdx !== prevDerivedIdx) {
    setSelectedVariantIdx(derivedIdx);
    setPrevDerivedIdx(derivedIdx);
  }

  // Per-variant saved values — preserves field data when switching variants
  // and then switching back, so the user does not have to re-type values.
  const savedVariantValues = React.useRef<Map<number, Record<string, unknown>>>(new Map());

  const { getValues, setValue, register } = useFormContext<Record<string, unknown>>();

  // Sentinel field: a registered hidden input whose value is the selected
  // variant label. Because it is registered, RHF correctly tracks its dirty
  // state — setValue on an unregistered path is silently ignored by RHF's
  // dirty engine, so this sentinel is the only reliable way to make the form
  // dirty when the variant combo changes.
  //
  // The sentinel path is prefixed with "__oneof__" so handleApply can
  // identify and process it specially rather than writing it to the task model.
  const sentinelPath = `__oneof__.${field.path}`;
  const sentinelRef = register(sentinelPath as never);

  // The initial sentinel value is the committed variant label (derived from
  // taskData). This is written once on mount so that switching back to the
  // original variant restores the sentinel to its default value and clears dirty.
  const commitedVariantLabel = field.variants[derivedIdx]?.label ?? "";

  const handleVariantChange = React.useCallback(
    (newIdx: number) => {
      if (newIdx === selectedVariantIdx) return;

      // Save current variant's field values before switching.
      // getValues() returns a NESTED object so we must use getNestedValue to
      // traverse dot-notation paths like "output.as" correctly.
      const currentVariant = field.variants[selectedVariantIdx];
      if (currentVariant) {
        const snapshot: Record<string, unknown> = {};
        const allValues = getValues();
        for (const p of collectLeafKinds(currentVariant.fields).keys()) {
          snapshot[p] = getNestedValue(allValues as Record<string, unknown>, p);
        }
        savedVariantValues.current.set(selectedVariantIdx, snapshot);
      }

      setSelectedVariantIdx(newIdx);

      const newLabel = field.variants[newIdx]?.label ?? "";
      // Update sentinel: compare against the committed variant label so that
      // switching back to the original variant marks the sentinel clean.
      setValue(sentinelPath as never, newLabel as never, {
        shouldDirty: newLabel !== commitedVariantLabel,
      });

      // Restore saved values for the new variant if previously stored;
      // otherwise clear its leaf paths so stale values from the old variant
      // (e.g. an object being rendered in a string input as "[object Object]")
      // are not left behind.
      //
      // Exception: paths that are shared with the current variant AND whose
      // field kind is identical are kept as-is (compatible data, e.g. two
      // object variants sharing a sub-field). Paths shared by variants of
      // different kinds (e.g. a string Expression and a json Data field at the
      // same path) must be cleared — the stored value is meaningless across
      // the kind boundary.
      const saved = savedVariantValues.current.get(newIdx);
      const newVariant = field.variants[newIdx];
      const currentKindByPath = currentVariant
        ? collectLeafKinds(currentVariant.fields)
        : new Map<string, string>();
      const newKindByPath = newVariant
        ? collectLeafKinds(newVariant.fields)
        : new Map<string, string>();

      if (saved) {
        for (const [path, value] of Object.entries(saved)) {
          setValue(path, value, { shouldDirty: true });
        }
      } else if (newVariant) {
        for (const [path, newKind] of newKindByPath) {
          const currentKind = currentKindByPath.get(path);
          if (currentKind !== newKind) {
            setValue(path, undefined, { shouldDirty: false });
          }
        }
      }

      // Paths exclusive to the old variant: clear them silently (no dirty
      // needed — dirty is tracked via the sentinel).
      for (const path of currentKindByPath.keys()) {
        if (!newKindByPath.has(path)) {
          setValue(path, undefined, { shouldDirty: false });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedVariantIdx, field.variants, getValues, setValue, sentinelPath, commitedVariantLabel],
  );

  const variantLabels = React.useMemo(() => field.variants.map((v) => v.label), [field.variants]);
  const currentVariant = field.variants[selectedVariantIdx];

  const visibleVariantFields = React.useMemo(() => {
    if (!currentVariant) return [];
    if (!isReadOnly) return currentVariant.fields;
    return filterReadOnlyFields(currentVariant.fields, taskData);
  }, [currentVariant, isReadOnly, taskData]);

  // If there is only 1 variant or no variants, render child fields without a combo selector
  if (field.variants.length <= 1) {
    return (
      <div className="dec-form-oneof-children">
        {visibleVariantFields.map((child) => (
          <FormField key={child.path} field={child} />
        ))}
      </div>
    );
  }

  return (
    <div className="dec-form-oneof-group">
      {/* Hidden sentinel input — keeps the variant selection dirty state in RHF.
          Only rendered in edit mode; read-only forms never switch variants. */}
      {!isReadOnly && <input {...sentinelRef} type="hidden" defaultValue={commitedVariantLabel} />}
      <div className="dec-form-field">
        <FieldLabel
          label={field.label}
          required={field.required}
          {...(field.description !== undefined ? { description: field.description } : {})}
        />
        <div className="dec-form-field-control">
          <Combobox
            value={variantLabels[selectedVariantIdx] ?? ""}
            onValueChange={(val) => {
              if (!val) return;
              const idx = variantLabels.indexOf(val);
              if (idx !== -1) handleVariantChange(idx);
            }}
            disabled={isReadOnly}
          >
            <ComboboxInput
              readOnly
              disabled={isReadOnly}
              value={variantLabels[selectedVariantIdx] ?? ""}
              aria-label={field.label}
              showClear={false}
              className="dec:h-7 dec:text-xs"
            />
            <ComboboxContent>
              <ComboboxList>
                {variantLabels.map((label) => (
                  <ComboboxItem key={label} value={label}>
                    {label}
                  </ComboboxItem>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
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

/**
 * Collects leaf field paths mapped to their effective kind for kind-aware clearing.
 *
 * For `string` fields, the key is refined to `"string:re"` when
 * `isRuntimeExpression` is true and `"string:plain"` otherwise. This ensures
 * that switching between a URI variant and an Expression variant — both
 * `"string"` kind but semantically incompatible — is treated as a kind-boundary
 * switch and the shared path is cleared on transition.
 */
function collectLeafKinds(fields: FormFieldDescriptor[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const f of fields) {
    if (f.kind === "object") {
      for (const [p, k] of collectLeafKinds(f.children)) result.set(p, k);
    } else if (f.kind === "one-of") {
      for (const v of f.variants) {
        for (const [p, k] of collectLeafKinds(v.fields)) result.set(p, k);
      }
    } else if (f.kind === "string") {
      result.set(f.path, f.isRuntimeExpression ? "string:re" : "string:plain");
    } else {
      result.set(f.path, f.kind);
    }
  }
  return result;
}

/**
 * Computes the initial sentinel default values for all OneOf fields in a task
 * form's field descriptors.
 *
 * Each OneOf field registers a hidden sentinel input at path
 * `__oneof__.<field.path>`. Its value is the committed variant's label,
 * derived from the task data via `matchesData`.
 *
 * Including these values in `form.reset()`'s first argument ensures that
 * `_defaultValues.__oneof__.*` matches `_formValues.__oneof__.*` (set by the
 * hidden inputs' `defaultValue` HTML attribute on mount). Without this, the
 * sentinel paths would be absent from `_defaultValues`, making `_getDirty()`
 * return `true` from the very first render. When the FIRST `shouldDirty: true`
 * setValue fires (e.g., on variant change), RHF detects
 * `isCurrentFieldPristine !== _formState.isDirty` and recomputes ALL dirty
 * fields via `getDirtyFields`, marking every sentinel path dirty — even those
 * whose variant was never changed.
 *
 * Returns a nested object like `{ emit: { event: { with: { source: "URI",
 * data: "Data" } } } }` to be set at `__oneof__` in the reset value.
 */
export function computeSentinelDefaults(
  fields: FormFieldDescriptor[],
  taskData: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === "object") {
      const nested = computeSentinelDefaults(f.children, taskData);
      if (Object.keys(nested).length > 0) {
        Object.assign(result, nested);
      }
    } else if (f.kind === "one-of") {
      const dataAtPath = f.path === "__root__" ? taskData : getNestedValue(taskData, f.path);
      const idx = f.variants.findIndex((v) => v.matchesData(dataAtPath));
      const label = f.variants[idx >= 0 ? idx : 0]?.label ?? "";
      if (f.path === "__root__") {
        // Root-level OneOf uses "__root__" as the nested key directly
        result["__root__"] = label;
      } else {
        // Build a nested path: "emit.event.with.data" → result["emit"]["event"]["with"]["data"] = label
        const parts = f.path.split(".");
        let obj = result;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]!;
          if (typeof obj[part] !== "object" || obj[part] === null) {
            obj[part] = {};
          }
          obj = obj[part] as Record<string, unknown>;
        }
        obj[parts[parts.length - 1]!] = label;
      }
      // Also recurse into variant fields (nested OneOfs)
      for (const variant of f.variants) {
        const nested = computeSentinelDefaults(variant.fields, taskData);
        Object.assign(result, nested);
      }
    }
  }
  return result;
}
