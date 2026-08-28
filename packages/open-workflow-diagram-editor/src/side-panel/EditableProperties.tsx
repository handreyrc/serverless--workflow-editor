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
import { ReadOnlyProperties } from "./ReadOnlyProperties";

/**
 * Editable presentation of a task's properties.
 *
 * PLACEHOLDER. This change establishes the read-only/edit seam only, so the editable
 * branch currently renders the same static rows as read-only mode until we implement
 *
 */
export function EditableProperties({ fields }: { fields: DetailField[] }) {
  return <ReadOnlyProperties fields={fields} />;
}
