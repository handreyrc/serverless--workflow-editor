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

/**
 * Describes a single editable scalar field derived from the OWF JSON Schema.
 * Used by TaskEditForm to render generic controls without any static field declarations.
 */
export type FieldDescriptor = {
  /** The property key as it appears in the task object (e.g. "if", "name"). */
  name: string;
  /** Human-readable label for the field. Derived from schema `title` annotation, or camelCase → "Camel Case" transform. */
  label: string;
  /** JSON Schema primitive type for the field. Determines the input control rendered by TaskEditForm. */
  type: "string" | "number" | "boolean";
  /** Whether the field is listed in the sub-schema's `required` array. */
  required: boolean;
  /** Scalar validation constraints extracted from the field's schema. */
  constraints: FieldConstraints;
};

/**
 * Scalar validation constraints for a field, extracted from its JSON Schema sub-schema.
 */
export type FieldConstraints = {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
};
