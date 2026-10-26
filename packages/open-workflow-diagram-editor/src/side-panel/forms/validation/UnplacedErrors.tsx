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
import { useTaskValidation } from "./taskValidationContext";
import "./validation.css";

/**
 * Lists the errors that block Apply but that no level of the form shows (untraced paths),
 * each with its path. Rendered in the footer so it is visible at any drill depth.
 */
export function UnplacedErrors() {
  const { taskValidation } = useTaskValidation();
  const entries = Object.entries(taskValidation.unplacedErrors);

  if (!taskValidation.attempted || entries.length === 0) return null;

  return (
    <ul className="dec-unplaced-errors" role="alert">
      {entries.map(([path, message]) => (
        <li key={path}>{path === "" ? message : `${path}: ${message}`}</li>
      ))}
    </ul>
  );
}
