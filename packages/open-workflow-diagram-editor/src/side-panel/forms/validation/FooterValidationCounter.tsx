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
import { useI18n } from "@openworkflowspec/i18n";
import "./validation.css";

export function FooterValidationCounter({ count }: { count: number }) {
  const { t } = useI18n();
  const unit = count === 1 ? t("sidebar.drill.error") : t("sidebar.drill.errors");
  return (
    <span className="dec-footer-validation-counter" role="status">
      {count} {unit}
    </span>
  );
}
