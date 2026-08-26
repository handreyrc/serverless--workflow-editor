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

import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { getSchemaForDefinition, getReferencedDefinitions } from "../../src/core/schemaFilter";

// ---------------------------------------------------------------------------
// Task definitions available in the schema
// ---------------------------------------------------------------------------

/** All task definition names exposed in the first combo. */
const TASK_DEFINITIONS: string[] = [
  "callTask",
  "doTask",
  "emitTask",
  "forTask",
  "forkTask",
  "listenTask",
  "raiseTask",
  "runTask",
  "setTask",
  "switchTask",
  "tryTask",
  "waitTask",
];

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: "14px",
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  maxWidth: "860px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  minWidth: "80px",
};

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  fontSize: "14px",
  fontFamily: "inherit",
  background: "#fff",
  color: "#1f2328",
  minWidth: "220px",
  cursor: "pointer",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 16px",
  height: "34px",
  fontSize: "13px",
  fontFamily: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  background: "linear-gradient(to bottom, #ffffff, #f3f4f6)",
  color: "#374151",
  transition: "opacity 60ms",
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.4,
  cursor: "not-allowed",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "420px",
  padding: "12px",
  fontSize: "12px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  lineHeight: 1.6,
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  background: "#f7f8fa",
  color: "#1f2328",
  resize: "vertical",
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "13px",
};

const hintStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  marginTop: "-8px",
};

// ---------------------------------------------------------------------------
// Story component
// ---------------------------------------------------------------------------

function SchemaFilterStory() {
  const [taskDef, setTaskDef] = useState<string>("callTask");
  const [subType, setSubType] = useState<string>("");
  const [schemaJson, setSchemaJson] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  /* Recalculate sub-types whenever the task changes. */
  const currentSubTypes = getReferencedDefinitions(taskDef);

  const handleTaskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTask = e.target.value;
    setTaskDef(newTask);
    setSubType("");
    setSchemaJson("");
    setError("");
  };

  const handleSubTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSubType(e.target.value);
    setSchemaJson("");
    setError("");
  };

  const handleGetSchema = () => {
    setError("");
    setSchemaJson("");
    try {
      /* If a sub-type (referenced def name) is selected, resolve that def
       * directly instead of the parent task. */
      const target = subType || taskDef;
      const schema = getSchemaForDefinition(target);
      setSchemaJson(JSON.stringify(schema, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(schemaJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={containerStyle}>
      {/* Task combo */}
      <div style={rowStyle}>
        <label style={labelStyle} htmlFor="task-select">
          Task
        </label>
        <select id="task-select" style={selectStyle} value={taskDef} onChange={handleTaskChange}>
          {TASK_DEFINITIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Sub-type combo */}
      <div style={rowStyle}>
        <label style={labelStyle} htmlFor="subtype-select">
          Sub-type
        </label>
        <select
          id="subtype-select"
          style={{
            ...selectStyle,
            color: currentSubTypes.length === 0 ? "#9ca3af" : selectStyle.color,
          }}
          value={subType}
          onChange={handleSubTypeChange}
          disabled={currentSubTypes.length === 0}
        >
          <option value="">— full task schema —</option>
          {currentSubTypes.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {currentSubTypes.length > 0 && (
        <p style={hintStyle}>
          Select a sub-type to resolve only that definition's schema, or leave empty to get the full{" "}
          <strong>{taskDef}</strong> schema.
        </p>
      )}

      {/* Get Schema button */}
      <div style={rowStyle}>
        <button style={buttonStyle} onClick={handleGetSchema}>
          Get Schema
        </button>
      </div>

      {/* Error */}
      {error && <p style={errorStyle}>Error: {error}</p>}

      {/* Output textarea */}
      <textarea
        readOnly
        style={textareaStyle}
        value={schemaJson}
        placeholder="Resolved JSON schema will appear here…"
        aria-label="Resolved JSON schema output"
      />

      {/* Copy button */}
      <div style={rowStyle}>
        <button
          style={schemaJson ? buttonStyle : disabledButtonStyle}
          onClick={handleCopy}
          disabled={!schemaJson}
        >
          {copied ? "Copied!" : "Copy to Clipboard"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------

const meta = {
  title: "Features/Schema Filter",
  component: SchemaFilterStory,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `
## Schema Filter — \`getSchemaForDefinition\`

\`getSchemaForDefinition\` resolves any named definition from the bundled
\`workflow.json\` schema into a **fully formed, self-contained JSON Schema
object**. Every \`allOf\` composition is merged — including the shared
\`taskBase\` fields inherited by all tasks — and all transitive \`$ref\`
dependencies are bundled inline, so the result can be handed directly to
a validator or documentation renderer with no further processing.

---

## Usage

The function is **synchronous**. The full schema merge is computed once on the
first call and cached at module level; all subsequent calls are O(1) lookups.

\`\`\`ts
// Resolve the full schema for the "setTask" definition
const schema = getSchemaForDefinition("setTask");

// schema is a plain Record<string, unknown> — no allOf remaining.
// Every field is inlined, including the inherited taskBase properties:
// schema.properties => { if, input, output, export, timeout, then, metadata, set }
\`\`\`

---

## Resolving a sub-definition

\`getReferencedDefinitions\` returns the names of all \`$defs\` entries that a
given task directly references (excluding structural scaffolding like
\`taskBase\` and \`taskList\`). Pass any of those names back to
\`getSchemaForDefinition\` to get a fully resolved, standalone schema for that
sub-definition.

\`\`\`ts
// Which named sub-definitions does tryTask reference?
const subDefs = getReferencedDefinitions("tryTask");
// => ["errorFilter", "retryPolicy"]

// Resolve the retryPolicy schema on its own
const retryPolicySchema = getSchemaForDefinition("retryPolicy");
\`\`\`

This pattern is also useful for \`callTask\`, which references \`endpoint\`,
\`externalResource\`, \`asyncApiServer\`, and more:

\`\`\`ts
const subDefs = getReferencedDefinitions("callTask");
// => ["asyncApiServer", "asyncApiSubscription", "duration",
//     "endpoint", "externalResource", "referenceableAuthenticationPolicy",
//     "runtimeExpression"]

const endpointSchema = getSchemaForDefinition("endpoint");
\`\`\`

---

## How it works

1. **Import** — the workflow schema is imported from the \`@openworkflowspec/sdk\`
   package as a static ES module at build time — no file I/O at runtime.

2. **Merge** — on the first call, \`allof-merge\` runs a single pass over the
   full schema. This resolves every \`$ref\` inside \`allOf\` compositions and
   flattens them into the parent object — including the shared \`taskBase\` fields
   inherited by all tasks. The result is stored in a module-level cache.

3. **Extract & bundle** — the requested entry is looked up from \`$defs\` of the
   merged schema. Its transitive \`$ref\` dependencies are collected and
   deep-cloned into a \`$defs\` block on the result, so the output is fully
   self-contained without requiring access to the original full schema.

`,
      },
    },
  },
} satisfies Meta<typeof SchemaFilterStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SchemaFilter: Story = {};
