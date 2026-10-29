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
 * The footer after switching the call kind (CallHTTP → CallMCP) through the real picker.
 *
 * The switch writes `""` with `shouldDirty` over every path whose field kind changes, and
 * clears the old variant's paths without it — so `dirtyFields` no longer tracks what the
 * user changed. The count comes from `computeDraftChanges` instead: a switch counts once,
 * plus each field edited after it.
 */

import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { ONE_OF_LEVELS_WORKFLOW } from "../fixtures/workflows";
import { clickApply, parseFixture } from "../test-utils";
import { panel, renderTaskPanel } from "../test-utils/panel-helpers";

vi.mock("../../src/side-panel/forms/ui/combobox", async () => {
  const { createComboboxStub } = await import("../test-utils/combobox-stub");
  return createComboboxStub();
});

const NODE_ID = "/do/callReference";
const model = parseFixture(ONE_OF_LEVELS_WORKFLOW);

async function switchToMcp() {
  const rendered = await renderTaskPanel(model, NODE_ID);
  await panel.choose(rendered.user, "CallMCP");
  return rendered;
}

describe("EditFormFooter — dirty counter after a variant switch", () => {
  it("counts the switch once", async () => {
    await switchToMcp();

    expect(panel.status()).toBe("1 changed");
    expect(panel.apply()).toBeEnabled();
  });

  // The switch has already flagged both paths in `dirtyFields`, so a count recomputed only
  // when those flags change would stay put here.
  it("counts the fields edited after the switch", async () => {
    const { form } = await switchToMcp();
    const before = panel.status();

    act(() => {
      form().setValue("with.method", "prompts/get" as never, { shouldDirty: true });
      form().setValue("with.transport.http.endpoint", "${test}" as never, { shouldDirty: true });
    });

    expect(panel.status()).not.toBe(before);
    expect(panel.status()).toBe("3 changed");
  });

  it("commits the switched call kind", async () => {
    const { form, user, committedTask } = await switchToMcp();

    act(() => form().setValue("with.method", "prompts/get" as never, { shouldDirty: true }));
    await clickApply(user);

    expect(committedTask()).toMatchObject({ call: "mcp" });
  });
});
