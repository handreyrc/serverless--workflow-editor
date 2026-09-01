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
import { renderHook } from "@testing-library/react";
import { useSiblingTaskNames } from "../../../src/side-panel/forms/useSiblingTaskNames";
import type { Specification } from "@openworkflowspec/sdk";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Flat top-level do list:
 *   do:
 *     - consumeReading: { listen: ... }
 *     - logReading:     { for: ... }
 *     - generateReport: { call: ... }
 *
 * Node ids (non-indexed):
 *   /do/consumeReading  /do/logReading  /do/generateReport
 */
const flatWorkflow: Specification.Workflow = {
  document: { dsl: "1.0.3", namespace: "test", name: "flat", version: "0.1.0" },
  do: [
    { consumeReading: { listen: { to: {} } } },
    { logReading: { for: { each: "x", in: ".items" }, do: [] } },
    { generateReport: { call: "http", with: { endpoint: "http://example.com" } } },
  ],
} as unknown as Specification.Workflow;

/**
 * Nested do list inside logReading.
 * In OWF the subtask list (`do`) is a direct property of the task object,
 * not nested inside the type-specific config (`for`):
 *
 *   do:
 *     - logReading:
 *         for: { each: x, in: .items }
 *         do:
 *           - callOrderService: { call: ... }
 *           - sendNotification: { call: ... }
 *     - generateReport: { call: ... }
 *
 * Node ids (non-indexed):
 *   /do/logReading
 *   /do/logReading/do/callOrderService
 *   /do/logReading/do/sendNotification
 *   /do/generateReport
 */
const nestedWorkflow: Specification.Workflow = {
  document: { dsl: "1.0.3", namespace: "test", name: "nested", version: "0.1.0" },
  do: [
    {
      logReading: {
        for: { each: "x", in: ".items" },
        do: [
          { callOrderService: { call: "http", with: { endpoint: "http://a.com" } } },
          { sendNotification: { call: "http", with: { endpoint: "http://b.com" } } },
        ],
      },
    },
    { generateReport: { call: "http", with: { endpoint: "http://c.com" } } },
  ],
} as unknown as Specification.Workflow;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getSiblings(model: Specification.Workflow | null, nodeId: string | undefined): string[] {
  const { result } = renderHook(() => useSiblingTaskNames(model, nodeId));
  return result.current;
}

// ---------------------------------------------------------------------------
// null / missing inputs
// ---------------------------------------------------------------------------

describe("useSiblingTaskNames — null / missing inputs", () => {
  it("returns empty when model is null", () => {
    expect(getSiblings(null, "/do/consumeReading")).toEqual([]);
  });

  it("returns empty when nodeId is undefined", () => {
    expect(getSiblings(flatWorkflow, undefined)).toEqual([]);
  });

  it("returns empty when path has only one segment (no list/name pair)", () => {
    expect(getSiblings(flatWorkflow, "/do")).toEqual([]);
  });

  it("returns empty when path has an odd number of segments (malformed)", () => {
    expect(getSiblings(flatWorkflow, "/do/logReading/do")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// flat top-level do list (accumulate-room-readings scenario)
// ---------------------------------------------------------------------------

describe("useSiblingTaskNames — flat top-level do list", () => {
  it("lists the other top-level tasks as siblings of consumeReading", () => {
    const result = getSiblings(flatWorkflow, "/do/consumeReading");
    expect(result).toEqual(["logReading", "generateReport"]);
  });

  it("lists the other top-level tasks as siblings of logReading", () => {
    const result = getSiblings(flatWorkflow, "/do/logReading");
    expect(result).toEqual(["consumeReading", "generateReport"]);
  });

  it("lists the other top-level tasks as siblings of generateReport", () => {
    const result = getSiblings(flatWorkflow, "/do/generateReport");
    expect(result).toEqual(["consumeReading", "logReading"]);
  });

  it("does not include the current task in the result", () => {
    expect(getSiblings(flatWorkflow, "/do/consumeReading")).not.toContain("consumeReading");
  });
});

// ---------------------------------------------------------------------------
// nested task list — must not leak parent scope
// ---------------------------------------------------------------------------

describe("useSiblingTaskNames — nested task list", () => {
  it("lists only the siblings inside the nested scope for callOrderService", () => {
    const result = getSiblings(nestedWorkflow, "/do/logReading/do/callOrderService");
    expect(result).toEqual(["sendNotification"]);
  });

  it("lists only the siblings inside the nested scope for sendNotification", () => {
    const result = getSiblings(nestedWorkflow, "/do/logReading/do/sendNotification");
    expect(result).toEqual(["callOrderService"]);
  });

  it("does not leak top-level tasks into a nested scope", () => {
    const result = getSiblings(nestedWorkflow, "/do/logReading/do/callOrderService");
    expect(result).not.toContain("logReading");
    expect(result).not.toContain("generateReport");
  });
});

// ---------------------------------------------------------------------------
// single-task list — no siblings
// ---------------------------------------------------------------------------

describe("useSiblingTaskNames — single-task list", () => {
  const singleTaskWorkflow: Specification.Workflow = {
    document: { dsl: "1.0.3", namespace: "test", name: "single", version: "0.1.0" },
    do: [{ onlyTask: { call: "http", with: { endpoint: "http://x.com" } } }],
  } as unknown as Specification.Workflow;

  it("returns empty when there are no siblings", () => {
    expect(getSiblings(singleTaskWorkflow, "/do/onlyTask")).toEqual([]);
  });
});
