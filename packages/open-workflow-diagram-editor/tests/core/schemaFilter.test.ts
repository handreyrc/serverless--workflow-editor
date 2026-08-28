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
import { getSchemaForDefinition, getReferencedDefinitions } from "../../src/core/schemaFilter";

// ---------------------------------------------------------------------------
// getSchemaForDefinition
// ---------------------------------------------------------------------------

describe("getSchemaForDefinition", () => {
  describe("allOf flattening — taskBase fields are merged into every task", () => {
    /* The shared base fields that every task definition inherits via
     * allOf: [{ $ref: "#/$defs/taskBase" }, { ... task-specific ... }] */
    const TASK_BASE_PROPS = ["if", "input", "output", "export", "timeout", "then", "metadata"];

    it.each([
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
    ] as const)(
      "%s has all taskBase properties at the top level (no allOf remaining)",
      (taskName) => {
        const schema = getSchemaForDefinition(taskName);

        expect(schema, `${taskName} should be an object`).toBeTypeOf("object");
        expect("allOf" in schema, `${taskName} should have no allOf after merge`).toBe(false);

        const properties = schema["properties"] as Record<string, unknown> | undefined;

        if (taskName === "callTask") {
          /* callTask is a oneOf discriminated union — base fields live inside
           * each variant, not at the top level. */
          expect(Array.isArray(schema["oneOf"]), "callTask should have oneOf").toBe(true);
        } else {
          expect(properties, `${taskName} should have properties`).toBeDefined();
          for (const prop of TASK_BASE_PROPS) {
            expect(prop in properties!, `${taskName}.properties should contain "${prop}"`).toBe(
              true,
            );
          }
        }
      },
    );
  });

  describe("task-specific fields are present alongside taskBase fields", () => {
    it("setTask has 'set' in properties", () => {
      const schema = getSchemaForDefinition("setTask");
      const properties = schema["properties"] as Record<string, unknown>;
      expect("set" in properties).toBe(true);
    });

    it("tryTask has 'try' and 'catch' in properties", () => {
      const schema = getSchemaForDefinition("tryTask");
      const properties = schema["properties"] as Record<string, unknown>;
      expect("try" in properties).toBe(true);
      expect("catch" in properties).toBe(true);
    });

    it("forkTask has 'fork' in properties", () => {
      const schema = getSchemaForDefinition("forkTask");
      const properties = schema["properties"] as Record<string, unknown>;
      expect("fork" in properties).toBe(true);
    });

    it("waitTask has 'wait' in properties and correct required array", () => {
      const schema = getSchemaForDefinition("waitTask");
      const properties = schema["properties"] as Record<string, unknown>;
      expect("wait" in properties).toBe(true);
      expect(schema["required"]).toContain("wait");
    });

    it("forTask has 'for' and 'do' in properties", () => {
      const schema = getSchemaForDefinition("forTask");
      const properties = schema["properties"] as Record<string, unknown>;
      expect("for" in properties).toBe(true);
      expect("do" in properties).toBe(true);
    });
  });

  describe("title is the task's own title, not 'TaskBase'", () => {
    it.each([
      ["setTask", "SetTask"],
      ["tryTask", "TryTask"],
      ["waitTask", "WaitTask"],
      ["forkTask", "ForkTask"],
      ["doTask", "DoTask"],
      ["emitTask", "EmitTask"],
      ["forTask", "ForTask"],
      ["listenTask", "ListenTask"],
      ["raiseTask", "RaiseTask"],
      ["runTask", "RunTask"],
      ["switchTask", "SwitchTask"],
    ] as const)("%s has title '%s'", (taskName, expectedTitle) => {
      const schema = getSchemaForDefinition(taskName);
      expect(schema["title"]).toBe(expectedTitle);
    });
  });

  describe("callTask oneOf variants", () => {
    it("has a oneOf array with named variants", () => {
      const schema = getSchemaForDefinition("callTask");
      const oneOf = schema["oneOf"] as Array<Record<string, unknown>>;
      expect(Array.isArray(oneOf)).toBe(true);
      expect(oneOf.length).toBeGreaterThan(0);
    });

    it("each callTask variant has taskBase fields inlined (no allOf)", () => {
      const schema = getSchemaForDefinition("callTask");
      const oneOf = schema["oneOf"] as Array<Record<string, unknown>>;

      for (const variant of oneOf) {
        expect("allOf" in variant, `variant "${variant["title"]}" should have no allOf`).toBe(
          false,
        );
        const props = variant["properties"] as Record<string, unknown> | undefined;
        expect(props, `variant "${variant["title"]}" should have properties`).toBeDefined();
        expect("if" in props!, `variant "${variant["title"]}" should have "if" from taskBase`).toBe(
          true,
        );
        expect("call" in props!, `variant "${variant["title"]}" should have "call"`).toBe(true);
      }
    });

    it("includes expected variant titles", () => {
      const schema = getSchemaForDefinition("callTask");
      const oneOf = schema["oneOf"] as Array<Record<string, unknown>>;
      const titles = oneOf.map((v) => v["title"]);
      expect(titles).toContain("CallHTTP");
      expect(titles).toContain("CallGRPC");
      expect(titles).toContain("CallAsyncAPI");
      expect(titles).toContain("CallOpenAPI");
    });
  });

  describe("non-task definitions", () => {
    it("retryPolicy resolves with correct shape", () => {
      const schema = getSchemaForDefinition("retryPolicy");
      expect(schema["title"]).toBe("RetryPolicy");
      expect(schema["type"]).toBe("object");
      const properties = schema["properties"] as Record<string, unknown>;
      expect("delay" in properties).toBe(true);
      expect("limit" in properties).toBe(true);
      expect("backoff" in properties).toBe(true);
    });

    it("taskBase resolves and has all base property keys", () => {
      const schema = getSchemaForDefinition("taskBase");
      const properties = schema["properties"] as Record<string, unknown>;
      expect("if" in properties).toBe(true);
      expect("input" in properties).toBe(true);
      expect("output" in properties).toBe(true);
      expect("timeout" in properties).toBe(true);
      expect("then" in properties).toBe(true);
    });

    it("asyncApiInboundMessage merges asyncApiOutboundMessage fields (no allOf remaining)", () => {
      /* asyncApiInboundMessage uses allOf: [{ $ref: asyncApiOutboundMessage }, { properties: { correlationId } }]
       * After merging, the result must be flat: no allOf, and all three properties present. */
      const schema = getSchemaForDefinition("asyncApiInboundMessage");
      expect("allOf" in schema, "allOf should be gone after merge").toBe(false);
      const properties = schema["properties"] as Record<string, unknown>;
      expect("payload" in properties, "inherited from asyncApiOutboundMessage").toBe(true);
      expect("headers" in properties, "inherited from asyncApiOutboundMessage").toBe(true);
      expect("correlationId" in properties, "own field of asyncApiInboundMessage").toBe(true);
    });
  });

  describe("$defs bundling — surviving $refs are resolvable without the original schema", () => {
    it("callTask result includes a $defs block", () => {
      const schema = getSchemaForDefinition("callTask");
      expect(schema["$defs"], "callTask should have a bundled $defs block").toBeDefined();
    });

    it("callTask $defs contains 'input' so validators can resolve #/$defs/input", () => {
      const schema = getSchemaForDefinition("callTask");
      const defs = schema["$defs"] as Record<string, unknown>;
      expect("input" in defs, "$defs should contain 'input'").toBe(true);
    });

    it("callTask $defs contains all transitive dependencies of 'input'", () => {
      /* input.$ref -> schema -> externalResource — all must be present */
      const schema = getSchemaForDefinition("callTask");
      const defs = schema["$defs"] as Record<string, unknown>;
      expect("schema" in defs, "$defs should contain 'schema' (used by input)").toBe(true);
      expect(
        "externalResource" in defs,
        "$defs should contain 'externalResource' (used by schema)",
      ).toBe(true);
    });

    it("setTask $defs contains taskBase inherited refs like 'input' and 'output'", () => {
      /* setTask inherits input/output/timeout etc. from taskBase via allOf,
       * those properties still contain $refs so a $defs block is bundled. */
      const schema = getSchemaForDefinition("setTask");
      const defs = schema["$defs"] as Record<string, unknown>;
      expect("input" in defs).toBe(true);
      expect("output" in defs).toBe(true);
      expect("flowDirective" in defs).toBe(true);
    });

    it("tryTask $defs contains 'retryPolicy' and 'errorFilter'", () => {
      const schema = getSchemaForDefinition("tryTask");
      const defs = schema["$defs"] as Record<string, unknown>;
      expect("retryPolicy" in defs).toBe(true);
      expect("errorFilter" in defs).toBe(true);
    });
  });

  describe("return value is a plain object", () => {
    it("returns an object (not a Promise)", () => {
      const result = getSchemaForDefinition("setTask");
      expect(result).toBeTypeOf("object");
      expect(result).not.toBeInstanceOf(Promise);
    });

    it("returns the same cached object on repeated calls for the same definition", () => {
      const a = getSchemaForDefinition("setTask");
      const b = getSchemaForDefinition("setTask");
      expect(a).toBe(b);
    });

    it("returns different objects for different definitions", () => {
      const setTask = getSchemaForDefinition("setTask");
      const tryTask = getSchemaForDefinition("tryTask");
      expect(setTask).not.toBe(tryTask);
    });
  });

  describe("error handling", () => {
    it("throws for an unknown definition", () => {
      expect(() => getSchemaForDefinition("nonExistentDef")).toThrow(
        'Definition "nonExistentDef" not found in workflow schema $defs.',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// getReferencedDefinitions
// ---------------------------------------------------------------------------

describe("getReferencedDefinitions", () => {
  describe("returns the referenced $defs names excluding structural scaffolding", () => {
    it("tryTask references errorFilter and retryPolicy", () => {
      const refs = getReferencedDefinitions("tryTask");
      expect(refs).toContain("errorFilter");
      expect(refs).toContain("retryPolicy");
    });

    it("listenTask references eventConsumptionStrategy and subscriptionIterator", () => {
      const refs = getReferencedDefinitions("listenTask");
      expect(refs).toContain("eventConsumptionStrategy");
      expect(refs).toContain("subscriptionIterator");
    });

    it("callTask references endpoint and externalResource", () => {
      const refs = getReferencedDefinitions("callTask");
      expect(refs).toContain("endpoint");
      expect(refs).toContain("externalResource");
    });

    it("waitTask references duration", () => {
      const refs = getReferencedDefinitions("waitTask");
      expect(refs).toContain("duration");
    });
  });

  describe("excludes structural scaffolding", () => {
    it.each(["callTask", "doTask", "setTask", "tryTask", "forkTask"] as const)(
      "%s does not include taskBase",
      (taskName) => {
        const refs = getReferencedDefinitions(taskName);
        expect(refs).not.toContain("taskBase");
      },
    );

    it.each(["doTask", "forTask", "forkTask", "tryTask"] as const)(
      "%s does not include taskList",
      (taskName) => {
        const refs = getReferencedDefinitions(taskName);
        expect(refs).not.toContain("taskList");
      },
    );
  });

  describe("returns a sorted array", () => {
    it("tryTask refs are sorted alphabetically", () => {
      const refs = getReferencedDefinitions("tryTask");
      expect(refs).toEqual([...refs].sort());
    });

    it("callTask refs are sorted alphabetically", () => {
      const refs = getReferencedDefinitions("callTask");
      expect(refs).toEqual([...refs].sort());
    });
  });

  describe("tasks with no domain references return an empty array", () => {
    it("setTask has no referenced definitions", () => {
      expect(getReferencedDefinitions("setTask")).toEqual([]);
    });
  });

  describe("cache isolation — getReferencedDefinitions reads raw schema, not merged", () => {
    it("returns consistent results across multiple calls", () => {
      const first = getReferencedDefinitions("tryTask");
      const second = getReferencedDefinitions("tryTask");
      expect(first).toEqual(second);
    });
  });
});
