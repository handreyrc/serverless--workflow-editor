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
import { getFormFieldsForNodeType } from "../../src/core/schemaWalker";
import type {
  OneOfField,
  StringField,
  ObjectField,
  MapField,
} from "../../src/core/schemaToFormFields";

describe("schemaToFormFields endpoint and oneOf unwrapping", () => {
  it("generates clean endpoint options for setTask input.schema.resource.endpoint", () => {
    const fields = getFormFieldsForNodeType("set");
    const inputField = fields.find((f) => f.path === "input") as ObjectField | undefined;
    expect(inputField).toBeDefined();

    const schemaOneOf = inputField?.children.find((f) => f.path === "input.schema") as
      | OneOfField
      | undefined;
    expect(schemaOneOf).toBeDefined();

    const externalVariant = schemaOneOf?.variants.find((v) => v.label === "Schema External");
    expect(externalVariant).toBeDefined();

    const resourceField = externalVariant?.fields.find(
      (f) => f.path === "input.schema.resource",
    ) as ObjectField | undefined;
    expect(resourceField).toBeDefined();

    const endpointOneOf = resourceField?.children.find(
      (f) => f.path === "input.schema.resource.endpoint",
    ) as OneOfField | undefined;
    expect(endpointOneOf).toBeDefined();

    // Endpoint should have collapsed variants: "URI" and "Endpoint Configuration"
    const variantLabels = endpointOneOf?.variants.map((v) => v.label);
    expect(variantLabels).toEqual(["URI", "Endpoint Configuration"]);

    // The "URI" variant should be a string field with placeholder
    const uriVariant = endpointOneOf?.variants.find((v) => v.label === "URI");
    const uriLeafField = uriVariant?.fields[0] as StringField;
    expect(uriLeafField.kind).toBe("string");
    expect(uriLeafField.placeholder).toBe("https://example.com/api/{id}");

    // The "Endpoint Configuration" variant should have a `uri` field as a oneOf (URI Template vs Expression)
    const configVariant = endpointOneOf?.variants.find((v) => v.label === "Endpoint Configuration");
    const uriFieldInConfig = configVariant?.fields.find(
      (f) => f.path === "input.schema.resource.endpoint.uri",
    ) as OneOfField | undefined;
    expect(uriFieldInConfig?.kind).toBe("one-of");
    const uriVariantLabels = uriFieldInConfig?.variants.map((v) => v.label);
    expect(uriVariantLabels).toContain("URI");
    expect(uriVariantLabels).toContain("Expression");
  });
});

describe("schemaToFormFields emitTask event.with field variants", () => {
  /** Navigate to the emit.event.with object inside emitTask fields.
   * The `emit.event` wrapper is transparent (single-child object) and is hoisted away,
   * so `emit.with` is a direct child of `emit`. */
  function getWithChildren() {
    const fields = getFormFieldsForNodeType("emit");
    const emitField = fields.find((f) => f.path === "emit") as ObjectField | undefined;
    // emit.event is hoisted: emit's children contain emit.event.with directly
    const withField = emitField?.children.find((f) => f.path === "emit.event.with") as
      | ObjectField
      | undefined;
    return withField?.children ?? [];
  }

  it("`source` emits a one-of with URI and Expression variants", () => {
    const withChildren = getWithChildren();
    const sourceField = withChildren.find((f) => f.path === "emit.event.with.source") as
      | OneOfField
      | undefined;
    expect(sourceField?.kind).toBe("one-of");
    const labels = sourceField?.variants.map((v) => v.label);
    expect(labels).toContain("URI");
    expect(labels).toContain("Expression");
  });

  it("`source` URI variant is a non-expression string with URI placeholder", () => {
    const withChildren = getWithChildren();
    const sourceField = withChildren.find((f) => f.path === "emit.event.with.source") as
      | OneOfField
      | undefined;
    const uriVariant = sourceField?.variants.find((v) => v.label === "URI");
    const leafField = uriVariant?.fields[0] as StringField | undefined;
    expect(leafField?.kind).toBe("string");
    expect(leafField?.isRuntimeExpression).toBe(false);
    expect(leafField?.placeholder).toBe("https://example.com/api/{id}");
  });

  it("`source` Expression variant is a runtime-expression string", () => {
    const withChildren = getWithChildren();
    const sourceField = withChildren.find((f) => f.path === "emit.event.with.source") as
      | OneOfField
      | undefined;
    const exprVariant = sourceField?.variants.find((v) => v.label === "Expression");
    const leafField = exprVariant?.fields[0] as StringField | undefined;
    expect(leafField?.kind).toBe("string");
    expect(leafField?.isRuntimeExpression).toBe(true);
  });

  it("`time` emits a one-of with Literal Time and Expression variants", () => {
    const withChildren = getWithChildren();
    const timeField = withChildren.find((f) => f.path === "emit.event.with.time") as
      | OneOfField
      | undefined;
    expect(timeField?.kind).toBe("one-of");
    const labels = timeField?.variants.map((v) => v.label);
    expect(labels).toContain("Literal Time");
    expect(labels).toContain("Expression");
  });

  it("`dataschema` emits a one-of with URI and Expression variants", () => {
    const withChildren = getWithChildren();
    const dataschemaField = withChildren.find((f) => f.path === "emit.event.with.dataschema") as
      | OneOfField
      | undefined;
    expect(dataschemaField?.kind).toBe("one-of");
    const labels = dataschemaField?.variants.map((v) => v.label);
    expect(labels).toContain("URI");
    expect(labels).toContain("Expression");
  });

  it("`data` emits a one-of with Expression and key-value Object variants", () => {
    const withChildren = getWithChildren();
    const dataField = withChildren.find((f) => f.path === "emit.event.with.data") as
      | OneOfField
      | undefined;
    expect(dataField?.kind).toBe("one-of");
    const labels = dataField?.variants.map((v) => v.label);
    expect(labels).toContain("Expression");
    // The {} unconstrained variant should render as a map (key-value editor)
    const mapVariant = dataField?.variants.find((v) => v.fields.some((f) => f.kind === "map"));
    expect(mapVariant).toBeDefined();
  });

  it("`data` map variant field carries label 'key-value'", () => {
    const withChildren = getWithChildren();
    const dataField = withChildren.find((f) => f.path === "emit.event.with.data") as
      | OneOfField
      | undefined;
    const mapVariant = dataField?.variants.find((v) => v.fields.some((f) => f.kind === "map"));
    const mapField = mapVariant?.fields.find((f) => f.kind === "map") as MapField | undefined;
    expect(mapField?.label).toBe("key-value");
  });

  it("`data` map variant matchesData returns true for plain objects and false for strings", () => {
    const withChildren = getWithChildren();
    const dataField = withChildren.find((f) => f.path === "emit.event.with.data") as
      | OneOfField
      | undefined;
    const mapVariant = dataField?.variants.find((v) => v.fields.some((f) => f.kind === "map"));
    expect(mapVariant?.matchesData({ key: "val" })).toBe(true);
    expect(mapVariant?.matchesData("expression")).toBe(false);
    expect(mapVariant?.matchesData([])).toBe(false);
  });
});

describe("schemaToFormFields emitTask transparent-wrapper elimination", () => {
  it("emit.event wrapper is hoisted: emit.event.with is a direct child of emit", () => {
    const fields = getFormFieldsForNodeType("emit");
    const emitField = fields.find((f) => f.path === "emit") as ObjectField | undefined;
    expect(emitField).toBeDefined();

    // emit.event should NOT appear as a child — it is a transparent single-child wrapper
    const eventChild = emitField?.children.find((f) => f.path === "emit.event");
    expect(eventChild).toBeUndefined();

    // emit.event.with SHOULD be a direct child of emit
    const withChild = emitField?.children.find((f) => f.path === "emit.event.with");
    expect(withChild).toBeDefined();
    expect(withChild?.kind).toBe("object");
  });
});
