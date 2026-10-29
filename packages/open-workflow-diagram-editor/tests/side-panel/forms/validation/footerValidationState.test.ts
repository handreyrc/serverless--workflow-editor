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

import { describe, it, expect } from "vitest";
import {
  countErrors,
  deriveFooterValidationState,
} from "../../../../src/side-panel/forms/validation/footerValidationState";
import { INITIAL_TASK_VALIDATION_STATE } from "../../../../src/side-panel/forms/validation/taskValidationContext";

const withErrors = {
  ...INITIAL_TASK_VALIDATION_STATE,
  attempted: true,
  fieldErrors: { a: "x", b: "y" },
  levelErrors: { c: "z" },
};

describe("deriveFooterValidationState", () => {
  it("hides the error UI before the first Apply attempt", () => {
    const s = { ...withErrors, attempted: false };
    const state = deriveFooterValidationState(s, countErrors(s.fieldErrors, s.levelErrors));
    expect(state.showErrorUI).toBe(false);
    expect(state.applyLabelKey).toBe("sidebar.form.apply");
    expect(state.applyVariant).toBe("default");
  });

  it("hides the error UI when the counter reaches 0", () => {
    const s = { ...INITIAL_TASK_VALIDATION_STATE, attempted: true };
    const state = deriveFooterValidationState(s, 0);
    expect(state.showErrorUI).toBe(false);
  });

  it("counts field and level errors and enables Apply anyway", () => {
    const state = deriveFooterValidationState(
      withErrors,
      countErrors(withErrors.fieldErrors, withErrors.levelErrors),
    );
    expect(state.showErrorUI).toBe(true);
    expect(state.applyLabelKey).toBe("sidebar.form.applyAnyway");
    expect(state.applyVariant).toBe("destructive");
    expect(state.isBypassable).toBe(true);
  });

  it("keeps Apply non-bypassable for an unparseable valueMap payload", () => {
    const s = { ...withErrors, hasUnparseableValueMapPayload: true };
    const state = deriveFooterValidationState(s, countErrors(s.fieldErrors, s.levelErrors));
    expect(state.showErrorUI).toBe(true);
    expect(state.applyLabelKey).toBe("sidebar.form.apply");
    expect(state.applyVariant).toBe("default");
    expect(state.isBypassable).toBe(false);
  });
});
