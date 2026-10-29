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
import { useLevelErrors } from "./taskValidationContext";
import "./validation.css";

export interface LevelErrorsProps {
  path: string;
}

export function LevelErrors({ path }: LevelErrorsProps) {
  const { message } = useLevelErrors(path);

  if (!message) return null;

  return (
    <div className="dec-level-errors" role="alert">
      <span>{message}</span>
    </div>
  );
}
