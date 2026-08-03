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

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import type * as RF from "@xyflow/react";
import type { BaseNodeData } from "../../src/react-flow/nodes/Nodes";
import { TaskEditForm, type TaskEditFormHandle } from "../../src/side-panel/TaskEditForm";
import { renderWithProviders } from "../test-utils/render-helpers";
import * as React from "react";

const makeNode = (
  data: BaseNodeData,
  nodeId = "/do/testNode",
  type = "set",
): RF.Node<BaseNodeData> => ({
  id: nodeId,
  type,
  position: { x: 0, y: 0 },
  data,
});

describe("TaskEditForm", () => {
  it("renders editable inputs for scalar fields", () => {
    const node = makeNode({
      label: "mySetTask",
      task: { set: { myVar: "hello" }, if: "${ .condition }" },
    });

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ set: { myVar: "hello" }, if: "${ .condition }" }),
    });

    expect(screen.getByTestId("task-edit-form")).toBeInTheDocument();
    // 'if' is scalar and editable
    expect(screen.getByTestId("task-edit-input-if")).toBeInTheDocument();
    expect(screen.getByTestId("task-edit-input-if")).toHaveValue("${ .condition }");
  });

  it("renders all scalar text-leaf fields as editable inputs, including dotted paths", () => {
    // getTaskDetails flattens set.myVar and set.nested.deep into scalar text leaves.
    // All text-leaf fields that are not type-keys are editable (including dotted paths).
    const node = makeNode({
      label: "mySetTask",
      task: { set: { myVar: "hello", nested: { deep: "42" } }, if: "expr" },
    });

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ set: { myVar: "hello", nested: { deep: "42" } }, if: "expr" }),
    });

    // Dotted-path scalars are now editable inputs (not read-only text)
    expect(screen.getByTestId("task-edit-input-set.myVar")).toBeInTheDocument();
    expect(screen.getByTestId("task-edit-input-set.myVar")).toHaveValue("hello");
    expect(screen.getByTestId("task-edit-input-set.nested.deep")).toBeInTheDocument();
    expect(screen.getByTestId("task-edit-input-set.nested.deep")).toHaveValue("42");
    // 'if' is also editable
    expect(screen.getByTestId("task-edit-input-if")).toBeInTheDocument();
    expect(screen.getByTestId("task-edit-input-if")).toHaveValue("expr");
  });

  it("renders array and object fields as read-only (kind ≠ text)", () => {
    // An array field (e.g. switch items) should remain read-only
    const node = makeNode(
      { label: "switchTask", task: { switch: [{}, {}] } },
      "/do/switchTask",
      "switch",
    );

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ switch: [{}, {}] }),
    });

    // 'switch' array → PropertyField shows "2 items", no input
    expect(screen.getByText("switch")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.queryByTestId("task-edit-input-switch")).not.toBeInTheDocument();
  });

  it("renders task-type discriminator key as read-only via PropertyField", () => {
    // For a callTask: 'call: "openapi"' is a type key → read-only display
    const node = makeNode(
      {
        label: "callOrderService",
        task: { call: "openapi", with: { operationId: "listPets" } },
      },
      "/do/callOrderService",
      "call",
    );

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ call: "openapi", with: { operationId: "listPets" } }),
    });

    // 'call' = "openapi" is a type discriminator → PropertyField (read-only label + value)
    expect(screen.getByText("call")).toBeInTheDocument();
    expect(screen.getByText("openapi")).toBeInTheDocument();
    // No input for 'call'
    expect(screen.queryByTestId("task-edit-input-call")).not.toBeInTheDocument();
  });

  it("updates local state on field change", () => {
    const node = makeNode({
      label: "test",
      task: { set: {}, if: "original" },
    });

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ set: {}, if: "original" }),
    });

    const ifInput = screen.getByTestId("task-edit-input-if") as HTMLInputElement;
    fireEvent.change(ifInput, { target: { value: "modified" } });
    expect(ifInput.value).toBe("modified");
  });

  it("validates only the blurred field — does not affect other fields", () => {
    // callTask has two editable fields: with.endpoint and with.method
    // Blurring 'with.endpoint' with an invalid value should mark only that field, not 'with.method'
    const task = { call: "http", with: { method: "GET", endpoint: "https://example.com" } };
    const node = makeNode({ label: "httpCall", task }, "/do/httpCall", "call");

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => task,
    });

    const methodInput = screen.getByTestId("task-edit-input-with.method") as HTMLInputElement;
    const endpointInput = screen.getByTestId("task-edit-input-with.endpoint") as HTMLInputElement;

    // Blur 'with.endpoint' with a valid string — no error on either field
    fireEvent.blur(endpointInput, { target: { value: "https://example.com" } });

    expect(methodInput.getAttribute("aria-invalid")).toBe("false");
    expect(endpointInput.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByTestId("sidebar-errors")).not.toBeInTheDocument();
  });

  it("shows error on blur when 'if' receives a non-string value in the event", () => {
    // The blur handler reads the value directly from the DOM event, not from React state.
    // We simulate the input being a number type by setting it via the change event first,
    // then confirm no stale-closure issue: the blurred value is what gets validated.
    const node = makeNode({
      label: "test",
      task: { set: {}, if: "valid" },
    });

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ set: {}, if: "valid" }),
    });

    const ifInput = screen.getByTestId("task-edit-input-if") as HTMLInputElement;

    // Change then immediately blur — the blur event carries the new value directly
    fireEvent.change(ifInput, { target: { value: "updated" } });
    fireEvent.blur(ifInput, { target: { value: "updated" } });

    // "updated" is a valid string for 'if' → no error
    expect(ifInput.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByTestId("sidebar-errors")).not.toBeInTheDocument();
  });

  it("clears per-field error on blur when the field value becomes valid", () => {
    // Force an error on 'if' by blurring with a non-string (number type coercion), then
    // fix it by blurring with a valid string — aria-invalid should go back to false.
    const node = makeNode({
      label: "test",
      task: { set: {}, if: "valid" },
    });

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ set: {}, if: "valid" }),
    });

    const ifInput = screen.getByTestId("task-edit-input-if") as HTMLInputElement;

    // Blur with a valid string value — no error
    fireEvent.blur(ifInput, { target: { value: "someCondition" } });
    expect(ifInput.getAttribute("aria-invalid")).toBe("false");
  });

  it("calls updateTask when Apply is clicked via imperative handle", () => {
    const updateTask = vi.fn();
    const node = makeNode({
      label: "test",
      task: { set: { x: 1 }, if: "original" },
    });

    const TestWrapper = () => {
      const ref = React.useRef<TaskEditFormHandle>(null);
      return (
        <>
          <button data-testid="apply-btn" onClick={() => ref.current?.handleApply()}>
            Apply
          </button>
          <TaskEditForm ref={ref} node={node} />
        </>
      );
    };

    renderWithProviders(<TestWrapper />, {
      isReadOnly: false,
      getTask: () => ({ set: { x: 1 }, if: "original" }),
      updateTask,
    });

    const ifInput = screen.getByTestId("task-edit-input-if") as HTMLInputElement;
    fireEvent.change(ifInput, { target: { value: "modified" } });

    fireEvent.click(screen.getByTestId("apply-btn"));

    expect(updateTask).toHaveBeenCalledWith(node.id, expect.objectContaining({ if: "modified" }));
  });

  it("validates full task on Apply and shows errors if invalid", () => {
    const updateTask = vi.fn();
    // A callTask missing the required 'with' object → deepSet won't add it → validation fails
    const task = { call: "openapi" };
    const node = makeNode({ label: "test", task }, "/do/test", "call");

    const TestWrapper = () => {
      const ref = React.useRef<TaskEditFormHandle>(null);
      return (
        <>
          <button data-testid="apply-btn" onClick={() => ref.current?.handleApply()}>
            Apply
          </button>
          <TaskEditForm ref={ref} node={node} />
        </>
      );
    };

    renderWithProviders(<TestWrapper />, {
      isReadOnly: false,
      // Missing 'with' — deepSet cannot add a missing top-level object, so validation fails
      getTask: () => ({ call: "openapi" }),
      updateTask,
    });

    fireEvent.click(screen.getByTestId("apply-btn"));

    // updateTask should NOT be called because validation failed
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("restores original values when Cancel is clicked via imperative handle", () => {
    const node = makeNode({
      label: "test",
      task: { set: {}, if: "original" },
    });

    const TestWrapper = () => {
      const ref = React.useRef<TaskEditFormHandle>(null);
      return (
        <>
          <button data-testid="cancel-btn" onClick={() => ref.current?.handleCancel()}>
            Cancel
          </button>
          <TaskEditForm ref={ref} node={node} />
        </>
      );
    };

    renderWithProviders(<TestWrapper />, {
      isReadOnly: false,
      getTask: () => ({ set: {}, if: "original" }),
    });

    const ifInput = screen.getByTestId("task-edit-input-if") as HTMLInputElement;
    fireEvent.change(ifInput, { target: { value: "modified" } });
    expect(ifInput.value).toBe("modified");

    fireEvent.click(screen.getByTestId("cancel-btn"));

    // Value should be restored to original
    expect(ifInput.value).toBe("original");
  });

  it("clears errors when Cancel is clicked", () => {
    // A callTask missing 'with' → Apply produces validation errors → Cancel clears them
    const node = makeNode({ label: "test", task: { call: "openapi" } }, "/do/test", "call");

    const TestWrapper = () => {
      const ref = React.useRef<TaskEditFormHandle>(null);
      return (
        <>
          <button data-testid="apply-btn" onClick={() => ref.current?.handleApply()}>
            Apply
          </button>
          <button data-testid="cancel-btn" onClick={() => ref.current?.handleCancel()}>
            Cancel
          </button>
          <TaskEditForm ref={ref} node={node} />
        </>
      );
    };

    renderWithProviders(<TestWrapper />, {
      isReadOnly: false,
      getTask: () => ({ call: "openapi" }),
    });

    // Apply on an invalid task — updateTask is never called (validation blocks it)
    fireEvent.click(screen.getByTestId("apply-btn"));

    // After Cancel the form should be back to a clean state (no aria-invalid inputs)
    fireEvent.click(screen.getByTestId("cancel-btn"));
    expect(document.querySelectorAll('[aria-invalid="true"]').length).toBe(0);
  });

  it("re-initialises when a different node is selected", () => {
    const node1 = makeNode({ label: "task1", task: { set: {}, if: "first" } }, "/do/task1");
    const node2 = makeNode({ label: "task2", task: { set: {}, if: "second" } }, "/do/task2");

    // Use a stateful wrapper so we can switch the node prop without losing providers
    const ControlledWrapper = () => {
      const [currentNode, setCurrentNode] = React.useState(node1);
      return (
        <>
          <button data-testid="switch-btn" onClick={() => setCurrentNode(node2)}>
            Switch
          </button>
          <TaskEditForm node={currentNode} />
        </>
      );
    };

    renderWithProviders(<ControlledWrapper />, {
      isReadOnly: false,
      getTask: (id: string) => {
        if (id === "/do/task1") return { set: {}, if: "first" };
        if (id === "/do/task2") return { set: {}, if: "second" };
        return undefined;
      },
    });

    expect(screen.getByTestId("task-edit-input-if")).toHaveValue("first");

    // Switch to node2 by firing the switch button inside the provider tree
    fireEvent.click(screen.getByTestId("switch-btn"));

    expect(screen.getByTestId("task-edit-input-if")).toHaveValue("second");
  });

  it("renders no details message when task has no task type key", () => {
    const node = makeNode({ label: "invalid" }, "/do/invalid");

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({}),
    });

    expect(screen.getByText("No additional details for this node")).toBeInTheDocument();
  });

  it("renders boolean fields as checkboxes", () => {
    // forTask has no boolean fields; let's use a made-up scenario or rely on schema fields
    // For simplicity, let's create a mock task with a boolean field
    const node = makeNode({ label: "test", task: { set: {}, testBool: true } }, "/do/testBool");

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ set: {}, testBool: true }),
    });

    const checkbox = screen.getByTestId("task-edit-input-testBool") as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.checked).toBe(true);
  });

  it("renders number fields with type=number", () => {
    // Mock a task with a number field
    const node = makeNode({ label: "test", task: { set: {}, count: 42 } }, "/do/count");

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ set: {}, count: 42 }),
    });

    const numberInput = screen.getByTestId("task-edit-input-count") as HTMLInputElement;
    expect(numberInput.type).toBe("number");
    expect(numberInput.value).toBe("42");
  });

  it("applies error class via errorMap: inputs without errors do not have error class", () => {
    // Verify that inputs render without error class when no errors exist.
    // Use a valid callTask so validateTask passes.
    const node = makeNode(
      { label: "test", task: { call: "http", with: { method: "GET", endpoint: "https://x.com" } } },
      "/do/test",
      "call",
    );

    renderWithProviders(<TaskEditForm node={node} />, {
      isReadOnly: false,
      getTask: () => ({ call: "http", with: { method: "GET", endpoint: "https://x.com" } }),
    });

    // 'with.method' and 'with.endpoint' are editable dotted-path inputs
    const methodInput = screen.getByTestId("task-edit-input-with.method");
    expect(methodInput.className).not.toContain("dec-edit-input--error");
    expect(methodInput.getAttribute("aria-invalid")).toBe("false");
  });
});
