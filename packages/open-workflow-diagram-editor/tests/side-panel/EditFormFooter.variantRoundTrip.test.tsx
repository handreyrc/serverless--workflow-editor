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
 * Switching a one-of away and back should restore the original draft state.
 *
 * Example: gRPC's `with.proto.endpoint` is a nested one-of (URI vs Endpoint Config)
 * inside the call kind one-of. Switching call kinds and back tests that nested
 * variants restore correctly even when their paths overlap.
 */

import { describe, it, expect, vi } from "vitest";
import { flattenTask } from "../../src/core/taskDraft";
import { SENTINEL_KEY } from "../../src/side-panel/forms/sentinels";
import { EMPTY_MAPS_WORKFLOW } from "../fixtures/workflows";
import { parseFixture } from "../test-utils";
import { panel, renderTaskPanel } from "../test-utils/panel-helpers";

vi.mock("../../src/side-panel/forms/ui/combobox", async () => {
  const { createComboboxStub } = await import("../test-utils/combobox-stub");
  return createComboboxStub();
});

const NODE_ID = "/do/greet";
const PROTO_ENDPOINT = "file://app/greet.proto";
const model = parseFixture(EMPTY_MAPS_WORKFLOW);

/** Visits the nested endpoint one-of and comes back, then round-trips the call kind. */
async function visitEndpointThenRoundTripCallKind() {
  const rendered = await renderTaskPanel(model, NODE_ID);
  const { user } = rendered;
  await panel.drillInto(user, "Proto", "Endpoint");
  await panel.choose(user, "Endpoint Configuration");
  await panel.choose(user, "URI");
  await panel.toTopLevel(user, "greet");
  await panel.choose(user, "CallHTTP");
  await panel.choose(user, "CallGRPC");
  return rendered;
}

describe("one-of round trips", () => {
  it("restores a nested one-of's value when its enclosing variant comes back", async () => {
    const { form, user } = await visitEndpointThenRoundTripCallKind();

    expect(form().getValues("with.proto.endpoint")).toBe(PROTO_ENDPOINT);
    await panel.drillInto(user, "Proto");
    expect(panel.row("Endpoint").textContent).toContain(`URI · ${PROTO_ENDPOINT}`);
  });

  // The object-shaped endpoint variant: its snapshot holds both `endpoint` and `endpoint.uri`.
  it("restores a committed object endpoint whole", async () => {
    const workflow = structuredClone(EMPTY_MAPS_WORKFLOW);
    const greet = workflow.do[0]!.greet as { with: { proto: { endpoint: unknown } } };
    greet.with.proto.endpoint = { uri: PROTO_ENDPOINT };
    const { form, user } = await renderTaskPanel(parseFixture(workflow), NODE_ID);

    await panel.choose(user, "CallHTTP");
    await panel.choose(user, "CallGRPC");

    expect(form().getValues("with.proto.endpoint")).toEqual({ uri: PROTO_ENDPOINT });
  });

  it("leaves no variant selection changed", async () => {
    const { form } = await visitEndpointThenRoundTripCallKind();

    const dirtySentinels = flattenTask(
      ((form().formState.dirtyFields as Record<string, unknown>)[SENTINEL_KEY] as
        | Record<string, unknown>
        | undefined) ?? {},
    );
    expect(Object.keys(dirtySentinels).filter((path) => dirtySentinels[path] === true)).toEqual([]);
  });
});
