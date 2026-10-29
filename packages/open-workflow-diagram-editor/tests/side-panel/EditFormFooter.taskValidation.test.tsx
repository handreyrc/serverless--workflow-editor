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
 * Integration tests for task-level validation in EditFormFooter.
 *
 * Uses a run/shell task: the `Command` field is directly labelled and accessible
 * without drill-in. Clearing it produces a required-field error (run.shell.command).
 *
 * Scenarios covered:
 * - No error counter before first Apply.
 * - First Apply on an invalid draft blocks commit and shows the counter.
 * - "Apply anyway" (second click) commits and clears the counter.
 * - Fixing the error before the second click clears the counter; Apply then commits.
 * - A valid draft commits on first Apply with no counter shown.
 */

import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { EditFormFooter } = await import("../../src/side-panel/EditFormFooter");
const { TaskForm } = await import("../../src/side-panel/forms/TaskForm");
const { renderWithProviders } = await import("../test-utils/render-helpers");
const { nodeAt, parseFixture, applyButton, applyAnywayButton } = await import("../test-utils");

// A `set` task with one entry — valid.
const VALID_WORKFLOW = parseFixture({
  document: { dsl: "1.0.3", namespace: "default", name: "test", version: "0.1.0" },
  do: [{ step1: { set: { a: "b" } } }],
});

// A `raise` task with a partial inline error: `type` is required but absent — invalid.
const INVALID_WORKFLOW = parseFixture({
  document: { dsl: "1.0.3", namespace: "default", name: "test", version: "0.1.0" },
  do: [{ step1: { raise: { error: { status: 400 } } } }],
});

const NODE_ID = "/do/step1";

function renderFooter(workflow: ReturnType<typeof parseFixture>) {
  const commitWorkflow = vi.fn();
  const node = nodeAt(workflow, NODE_ID);

  renderWithProviders(
    <>
      <TaskForm
        nodeType={node.type!}
        task={node.data.task!}
        nodeId={NODE_ID}
        taskReference={node.data.taskReference}
      />
      <EditFormFooter node={node} />
    </>,
    { isReadOnly: false, contentFormat: "yaml", model: workflow, commitWorkflow },
  );

  return { commitWorkflow, user: userEvent.setup() };
}

/** The FooterValidationCounter uses class dec-footer-validation-counter. */
const errorCounter = () =>
  document.querySelector(".dec-footer-validation-counter") as HTMLElement | null;

describe("EditFormFooter — task-level validation", () => {
  it("does not show the error counter before Apply is clicked", async () => {
    renderFooter(INVALID_WORKFLOW);
    await act(async () => {});

    expect(errorCounter()).not.toBeInTheDocument();
    // Apply is disabled on a clean draft (no changes).
    expect(applyButton()).toBeDisabled();
  });

  it("blocks commit and shows the error counter on first Apply with an invalid draft", async () => {
    // INVALID_WORKFLOW: raise task missing required `raise.error.type` — already invalid.
    // Editing `status` makes it dirty without fixing the type error.
    const { commitWorkflow, user } = renderFooter(INVALID_WORKFLOW);
    await act(async () => {});

    const status = screen.getByLabelText("Status");
    await user.clear(status);
    await user.type(status, "500");
    await user.tab();

    await user.click(applyButton());

    // Commit must not have been called on the first click.
    expect(commitWorkflow).not.toHaveBeenCalled();
    // Error counter must be visible.
    expect(errorCounter()).toBeInTheDocument();
  });

  it("shows 'Apply anyway' label after the first blocked Apply", async () => {
    const { user } = renderFooter(INVALID_WORKFLOW);
    await act(async () => {});

    const status = screen.getByLabelText("Status");
    await user.clear(status);
    await user.type(status, "500");
    await user.tab();
    await user.click(applyButton());

    expect(applyAnywayButton()).toBeInTheDocument();
  });

  it("commits on 'Apply anyway' (second click) and clears the error counter", async () => {
    const { commitWorkflow, user } = renderFooter(INVALID_WORKFLOW);
    await act(async () => {});

    const status = screen.getByLabelText("Status");
    await user.clear(status);
    await user.type(status, "500");
    await user.tab();

    // First click: blocked.
    await user.click(applyButton());
    expect(commitWorkflow).not.toHaveBeenCalled();

    // Second click: "Apply anyway" — must commit.
    await user.click(applyAnywayButton()!);
    expect(commitWorkflow).toHaveBeenCalledTimes(1);

    // Counter disappears after commit.
    expect(errorCounter()).not.toBeInTheDocument();
  });

  it("commits normally on first Apply when the draft is valid", async () => {
    // VALID_WORKFLOW: set task with { a: "b" } — valid.
    // Changing the value keeps it valid and makes the form dirty.
    const { commitWorkflow, user } = renderFooter(VALID_WORKFLOW);
    await act(async () => {});

    const valueInput = screen.getAllByLabelText("Entry value")[0]!;
    await user.clear(valueInput);
    await user.type(valueInput, "c");
    await user.tab();

    await user.click(applyButton());

    expect(commitWorkflow).toHaveBeenCalledTimes(1);
    expect(errorCounter()).not.toBeInTheDocument();
  });

  it("decrements the counter to 0 when the user fixes the error before the second click", async () => {
    // INVALID_WORKFLOW: raise with missing type. Type is a required string field.
    const { commitWorkflow, user } = renderFooter(INVALID_WORKFLOW);
    await act(async () => {});

    // Make dirty by editing status (stays invalid — type still missing).
    const status = screen.getByLabelText("Status");
    await user.clear(status);
    await user.type(status, "500");
    await user.tab();

    // First click: blocked, counter appears.
    await user.click(applyButton());
    expect(errorCounter()).toBeInTheDocument();
    expect(commitWorkflow).not.toHaveBeenCalled();

    // Fix: type in the required Type field.
    const typeField = screen.getByLabelText("Type");
    await user.type(typeField, "https://errors.example.com/not-found");
    await user.tab();

    // Counter should clear (0 errors).
    expect(errorCounter()).not.toBeInTheDocument();

    // Now Apply commits successfully.
    await user.click(applyButton());
    expect(commitWorkflow).toHaveBeenCalledTimes(1);
  });
});
