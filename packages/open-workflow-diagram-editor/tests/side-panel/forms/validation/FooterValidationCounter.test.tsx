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
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@openworkflowspec/i18n";
import { en } from "../../../../src/i18n/locales/en";
import { FooterValidationCounter } from "../../../../src/side-panel/forms/validation/FooterValidationCounter";

function renderCounter(count: number) {
  render(
    <I18nProvider locale="en" dictionaries={{ en }}>
      <FooterValidationCounter count={count} />
    </I18nProvider>,
  );
}

describe("FooterValidationCounter", () => {
  it("renders with role='status'", () => {
    renderCounter(2);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("uses the singular 'error' label for a count of 1", () => {
    renderCounter(1);
    expect(screen.getByRole("status")).toHaveTextContent("1 error");
  });

  it("uses the plural 'errors' label for a count greater than 1", () => {
    renderCounter(3);
    expect(screen.getByRole("status")).toHaveTextContent("3 errors");
  });

  it("uses the plural 'errors' label for a count of 0", () => {
    renderCounter(0);
    expect(screen.getByRole("status")).toHaveTextContent("0 errors");
  });

  it("applies the dec-footer-validation-counter class", () => {
    renderCounter(1);
    expect(screen.getByRole("status")).toHaveClass("dec-footer-validation-counter");
  });
});
