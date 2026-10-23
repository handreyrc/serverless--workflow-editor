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
import type { UseFormReturn } from "react-hook-form";
import type { FormFieldDescriptor } from "@/core/schemaToFormFields";
import { flattenTask } from "@/core/taskDraft";
import { validateTaskData } from "./schemaValidator";
import {
  prepareValuesForValidation,
  extractFieldErrors,
  isSectionEmpty,
  buildOptionalSectionSet,
} from "./fieldErrorMapper";
import { SENTINEL_KEY } from "../sentinels";

export type FieldValidationHandler = (path: string) => void;

/**
 * Hook that manages schema-driven, field-level validation for task editing forms.
 *
 * Strictly active in edit mode (`!isReadOnly`).
 *
 * @param nodeType - Graph node type
 * @param form - React Hook Form instance
 * @param isReadOnly - Whether form is in read-only mode
 * @param fields - Form field descriptors for the task
 */
export function useFieldLevelValidation(
  nodeType: string,
  form: UseFormReturn<Record<string, unknown>>,
  isReadOnly: boolean,
  fields: FormFieldDescriptor[] = [],
): { validateField: FieldValidationHandler } {
  const optionalSections = React.useMemo(() => buildOptionalSectionSet(fields), [fields]);

  const validateField = React.useCallback<FieldValidationHandler>(
    (path: string) => {
      if (isReadOnly || !path || path.startsWith(SENTINEL_KEY) || path.startsWith("__")) {
        return;
      }

      const formValues = form.getValues();
      const flat = flattenTask(formValues);

      // Extract current sentinels
      const sentinels: Record<string, unknown> = {};
      const liveOneof = formValues.__oneof__ as Record<string, unknown> | undefined;
      if (liveOneof) {
        for (const [k, v] of Object.entries(flattenTask(liveOneof))) {
          sentinels[`${SENTINEL_KEY}.${k}`] = v;
        }
      }

      // Required sections must still be validated when empty so a cleared required field
      // surfaces a missing-field error; only optional sections are skipped.
      const parentSection = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "";
      if (
        parentSection &&
        optionalSections.has(parentSection) &&
        isSectionEmpty(parentSection, formValues)
      ) {
        // Clear errors for all paths under this now-empty optional section
        const sectionPathsToClear = Object.keys(flat).filter(
          (k) => k === parentSection || k.startsWith(`${parentSection}.`),
        );
        if (sectionPathsToClear.length > 0) {
          form.clearErrors(sectionPathsToClear);
        }
        return;
      }

      // Prepare values and validate against schema
      const preparedValues = prepareValuesForValidation(formValues, fields, sentinels);
      const ajvErrors = validateTaskData(nodeType, preparedValues);
      const fieldErrors = extractFieldErrors(ajvErrors, formValues, fields, sentinels, path);

      const errorMessage = fieldErrors[path];
      if (errorMessage) {
        form.setError(path, {
          type: "schema",
          message: errorMessage,
        });
      } else {
        form.clearErrors(path);
      }
    },
    [isReadOnly, nodeType, form, fields, optionalSections],
  );

  return { validateField };
}
