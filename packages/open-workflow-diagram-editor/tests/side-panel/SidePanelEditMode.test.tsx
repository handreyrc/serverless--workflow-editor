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
import { SidePanel } from "../../src/side-panel/SidePanel";
import { parseWorkflow } from "../../src/core/workflowSdk";
import { renderWithProviders } from "../test-utils/render-helpers";
import { WORKFLOW_WITH_METADATA_JSON } from "../fixtures/workflows";

describe("SidePanel — edit mode footer", () => {
  it("renders Apply and Cancel buttons when a node is selected in edit mode", () => {
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);
    const mockNode = {
      id: "/do/step1",
      type: "set",
      position: { x: 0, y: 0 },
      data: { label: "step1", task: { set: { variable: "x" } } },
    };

    renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: false,
      selectedNodeId: "/do/step1",
      nodes: [mockNode],
      getTask: () => ({ set: { variable: "x" } }),
    });

    expect(screen.getByTestId("task-edit-apply")).toBeInTheDocument();
    expect(screen.getByTestId("task-edit-cancel")).toBeInTheDocument();
    expect(screen.getByText("Apply")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("does not render Apply and Cancel buttons in read-only mode", () => {
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);
    const mockNode = {
      id: "/do/step1",
      type: "set",
      position: { x: 0, y: 0 },
      data: { label: "step1", task: { set: { variable: "x" } } },
    };

    renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: true,
      selectedNodeId: "/do/step1",
      nodes: [mockNode],
    });

    expect(screen.queryByTestId("task-edit-apply")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-edit-cancel")).not.toBeInTheDocument();
  });

  it("does not render Apply and Cancel buttons in edit mode when no node is selected", () => {
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);

    renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: false,
      selectedNodeId: null,
    });

    expect(screen.queryByTestId("task-edit-apply")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-edit-cancel")).not.toBeInTheDocument();
  });

  it("shows MermaidActions when in edit mode with no node selected and model present", () => {
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);

    renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: false,
      selectedNodeId: null,
    });

    // MermaidActions should still appear in the footer
    expect(screen.getByText(/Copy Mermaid Code/i)).toBeInTheDocument();
  });

  it("Apply button click calls handleApply via formRef → validates task", () => {
    const updateTask = vi.fn();
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);
    const mockNode = {
      id: "/do/step1",
      type: "set",
      position: { x: 0, y: 0 },
      data: { label: "step1", task: { set: { variable: "my first workflow" } } },
    };

    renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: false,
      selectedNodeId: "/do/step1",
      nodes: [mockNode],
      getTask: () => ({ set: { variable: "my first workflow" } }),
      updateTask,
    });

    const applyButton = screen.getByTestId("task-edit-apply");
    fireEvent.click(applyButton);

    // Valid set task → updateTask should be called
    expect(updateTask).toHaveBeenCalledWith(
      "/do/step1",
      expect.objectContaining({ set: expect.anything() }),
    );
  });

  it("Cancel button click calls handleCancel via formRef → restores values", () => {
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);
    const mockNode = {
      id: "/do/step1",
      type: "set",
      position: { x: 0, y: 0 },
      data: { label: "step1", task: { set: {}, if: "original" } },
    };

    renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: false,
      selectedNodeId: "/do/step1",
      nodes: [mockNode],
      getTask: () => ({ set: {}, if: "original" }),
    });

    // Change the 'if' field
    const ifInput = screen.getByTestId("task-edit-input-if") as HTMLInputElement;
    fireEvent.change(ifInput, { target: { value: "changed" } });
    expect(ifInput.value).toBe("changed");

    // Click Cancel
    fireEvent.click(screen.getByTestId("task-edit-cancel"));
    expect(ifInput.value).toBe("original");
  });

  it("the footer has the accessible aria-label for task actions", () => {
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);
    const mockNode = {
      id: "/do/step1",
      type: "set",
      position: { x: 0, y: 0 },
      data: { label: "step1", task: { set: {} } },
    };

    const { container } = renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: false,
      selectedNodeId: "/do/step1",
      nodes: [mockNode],
      getTask: () => ({ set: {} }),
    });

    // SidebarFooter renders as a data-slot="sidebar-footer" element with aria-label
    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    expect(footer).toBeInTheDocument();
    expect(footer?.getAttribute("aria-label")).toBe("Task edit actions");
  });

  it("shows the error section above the form in edit mode when the node has errors", () => {
    const { model } = parseWorkflow(WORKFLOW_WITH_METADATA_JSON);
    const nodeId = "/do/step1";
    const mockNode = {
      id: nodeId,
      type: "set",
      position: { x: 0, y: 0 },
      data: { label: "step1", task: { set: { variable: "x" } } },
    };

    renderWithProviders(<SidePanel />, {
      model,
      isReadOnly: false,
      selectedNodeId: nodeId,
      nodes: [mockNode],
      nodeIds: new Set([nodeId]),
      errors: [{ path: `${nodeId}/with`, message: "endpoint is required" }],
      getTask: () => ({ set: { variable: "x" } }),
    });

    expect(screen.getByTestId("sidebar-errors")).toBeInTheDocument();
    expect(screen.getByText("endpoint is required")).toBeInTheDocument();
    // The edit form is still rendered alongside the errors
    expect(screen.getByTestId("task-edit-form")).toBeInTheDocument();
  });
});
