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
 * A draft the user has returned to its committed state has nothing to lose: the footer says
 * nothing, Apply is disabled and the navigate-away guard lets navigation through.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import {
  EMPTY_MAPS_WORKFLOW,
  MANAGING_GITHUB_ISSUES_WORKFLOW,
  RUN_PROCESS_TYPES_WORKFLOW,
} from "../fixtures/workflows";
import { clickApply, parseFixture } from "../test-utils";
import { panel, renderTaskPanel } from "../test-utils/panel-helpers";

vi.mock("../../src/side-panel/forms/ui/combobox", async () => {
  const { createComboboxStub } = await import("../test-utils/combobox-stub");
  return createComboboxStub();
});

type User = ReturnType<typeof userEvent.setup>;

const RUN_NODE_ID = "/do/buildImage";
const GRPC_NODE_ID = "/do/greet";
const EMIT_NODE_ID = "/do/awaitForDevWork/do/notify";

describe("a switch to an option left empty", () => {
  // The option's fields are padded with "" by the switch, which used to leave the old URI in
  // place: Apply committed nothing. It commits the empty object; the SDK reports what's missing.
  it("counts once and commits the empty option", async () => {
    const { user, committedTask } = await renderTaskPanel(
      parseFixture(EMPTY_MAPS_WORKFLOW),
      GRPC_NODE_ID,
    );
    await panel.drillInto(user, "Proto", "Endpoint");
    await panel.choose(user, "Endpoint Configuration");

    expect(panel.status()).toBe("1 changed");
    await clickApply(user);
    expect(committedTask()).toMatchObject({ with: { proto: { endpoint: {} } } });
  });
});

describe("a draft returned to its committed state", () => {
  it("starts clean", async () => {
    const { guardBlocks } = await renderTaskPanel(
      parseFixture(RUN_PROCESS_TYPES_WORKFLOW),
      RUN_NODE_ID,
    );

    expect(panel.status()).toBe("");
    expect(panel.apply()).toBeDisabled();
    expect(guardBlocks()).toBe(false);
  });

  // RHF's `isDirty` never returns to false in this form (registered paths without a default),
  // so Apply and the guard read the draft's real changes instead.
  it.each<[string, string, Parameters<typeof renderTaskPanel>[0], (user: User) => Promise<void>]>([
    [
      "a character typed and deleted",
      RUN_NODE_ID,
      parseFixture(RUN_PROCESS_TYPES_WORKFLOW),
      async (user) => {
        await user.type(screen.getByLabelText("Image"), "x");
        await user.type(screen.getByLabelText("Image"), "{backspace}");
      },
    ],
    [
      "a process type switched away and back",
      RUN_NODE_ID,
      parseFixture(RUN_PROCESS_TYPES_WORKFLOW),
      async (user) => {
        await panel.choose(user, "Run Script");
        await panel.choose(user, "Run Container");
      },
    ],
    [
      "a nested endpoint switched away and back",
      GRPC_NODE_ID,
      parseFixture(EMPTY_MAPS_WORKFLOW),
      async (user) => {
        await panel.drillInto(user, "Proto", "Endpoint");
        await panel.choose(user, "Endpoint Configuration");
        await panel.choose(user, "URI");
      },
    ],
    // Both options share the path, so the switch clears it and the way back restores it.
    [
      "a structured value switched to an expression and back",
      EMIT_NODE_ID,
      parseFixture(MANAGING_GITHUB_ISSUES_WORKFLOW),
      async (user) => {
        await panel.chooseIn(user, "Data", "Expression");
        await panel.chooseIn(user, "Data", "Data");
      },
    ],
    [
      "a URI switched to an expression and back",
      EMIT_NODE_ID,
      parseFixture(MANAGING_GITHUB_ISSUES_WORKFLOW),
      async (user) => {
        await panel.chooseIn(user, "Source", "Expression");
        await panel.chooseIn(user, "Source", "URI");
      },
    ],
  ])("has nothing to lose after %s", async (_name, nodeId, model, edit) => {
    const { user, guardBlocks } = await renderTaskPanel(model, nodeId);

    await edit(user);

    expect(panel.status()).toBe("");
    expect(panel.apply()).toBeDisabled();
    expect(guardBlocks()).toBe(false);
  });
});

describe("an edited option switched away and back", () => {
  it("keeps the edit", async () => {
    const { user, guardBlocks } = await renderTaskPanel(
      parseFixture(MANAGING_GITHUB_ISSUES_WORKFLOW),
      EMIT_NODE_ID,
    );
    const data = () => screen.getByRole("textbox", { name: "Data" });
    await user.clear(data());
    await user.type(data(), "issue: edited");

    await panel.chooseIn(user, "Data", "Expression");
    await panel.chooseIn(user, "Data", "Data");

    expect(data()).toHaveValue("issue: edited");
    expect(panel.status()).toBe("1 changed");
    expect(guardBlocks()).toBe(true);
  });
});
