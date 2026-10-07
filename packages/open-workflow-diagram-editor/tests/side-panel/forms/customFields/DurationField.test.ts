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

import { describe, expect, it } from "vitest";
import { ISO_8601_DURATION_PATTERN } from "../../../../src/side-panel/forms/customFields/DurationField";

// ---------------------------------------------------------------------------
// ISO_8601_DURATION_PATTERN
// ---------------------------------------------------------------------------

const re = new RegExp(ISO_8601_DURATION_PATTERN);

describe("ISO_8601_DURATION_PATTERN", () => {
  it.each([
    // Date-only designators
    "P1Y",
    "P2M",
    "P3W",
    "P4D",
    // Time-only designators
    "PT1H",
    "PT30M",
    "PT45S",
    // Combined date + time
    "P1Y2M3DT4H5M6S",
    "P1DT12H",
    // Decimal fractions
    "P1.5Y",
    "PT0.5S",
    // Zero duration
    "P0D",
    "PT0S",
  ] as const)("matches valid duration '%s'", (input) => {
    expect(re.test(input)).toBe(true);
  });

  it.each([
    // Missing "P" prefix
    "1Y",
    "T1H",
    // Just "P" with no designators (P alone is invalid — the pattern requires at least one part)
    "P",
    // Time marker "T" with no following value
    "PT",
    // Plain strings / ISO dates
    "2024-01-01",
    "",
    "hello",
    // Seconds without T separator
    "P30S",
  ] as const)("rejects invalid value '%s'", (input) => {
    expect(re.test(input)).toBe(false);
  });
});
