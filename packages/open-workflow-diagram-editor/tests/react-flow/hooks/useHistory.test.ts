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
import { renderHook, act } from "@testing-library/react";
import {
  HISTORY_STACK_SIZE,
  historyReducer,
  useHistory,
} from "../../../src/react-flow/hooks/useHistory";
import type { HistoryState } from "../../../src/react-flow/hooks/useHistory";

type S = string; // Use plain strings as the snapshot type for simplicity.

const empty: HistoryState<S> = { past: [], present: null, future: [] };

// ---------------------------------------------------------------------------
// historyReducer — pure function tests
// ---------------------------------------------------------------------------

describe("historyReducer", () => {
  describe("PUSH", () => {
    it("sets present when starting from null — no past entry created", () => {
      const next = historyReducer(empty, { type: "PUSH", payload: "a" });
      expect(next.present).toBe("a");
      expect(next.past).toHaveLength(0);
      expect(next.future).toHaveLength(0);
    });

    it("moves current present to past and sets new payload as present", () => {
      const state: HistoryState<S> = { past: [], present: "a", future: [] };
      const next = historyReducer(state, { type: "PUSH", payload: "b" });
      expect(next.present).toBe("b");
      expect(next.past).toEqual(["a"]);
      expect(next.future).toHaveLength(0);
    });

    it("discards future (branch pruning — REQ-05)", () => {
      const state: HistoryState<S> = {
        past: ["a"],
        present: "b",
        future: ["c", "d"],
      };
      const next = historyReducer(state, { type: "PUSH", payload: "e" });
      expect(next.future).toHaveLength(0);
      expect(next.present).toBe("e");
      expect(next.past).toEqual(["a", "b"]);
    });

    it("evicts oldest past entry when cap is reached (REQ-04)", () => {
      const past = Array.from({ length: HISTORY_STACK_SIZE }, (_, i) => `s${i}`);
      const state: HistoryState<S> = { past, present: "current", future: [] };
      const next = historyReducer(state, { type: "PUSH", payload: "new" });
      expect(next.past).toHaveLength(HISTORY_STACK_SIZE);
      expect(next.past[0]).toBe("s1"); // oldest evicted
      expect(next.past[HISTORY_STACK_SIZE - 1]).toBe("current");
      expect(next.present).toBe("new");
    });
  });

  describe("SET_PRESENT", () => {
    it("replaces present without touching past or future", () => {
      const state: HistoryState<S> = { past: ["a"], present: "b", future: ["c"] };
      const next = historyReducer(state, { type: "SET_PRESENT", payload: "z" });
      expect(next.present).toBe("z");
      expect(next.past).toEqual(["a"]);
      expect(next.future).toEqual(["c"]);
    });

    it("works from a null present", () => {
      const next = historyReducer(empty, { type: "SET_PRESENT", payload: "z" });
      expect(next.present).toBe("z");
      expect(next.past).toHaveLength(0);
      expect(next.future).toHaveLength(0);
    });
  });

  describe("UNDO", () => {
    it("is a no-op when past is empty", () => {
      const state: HistoryState<S> = { past: [], present: "a", future: [] };
      const next = historyReducer(state, { type: "UNDO" });
      expect(next).toBe(state); // same reference — no change
    });

    it("moves present to front of future and pops last past as present", () => {
      const state: HistoryState<S> = {
        past: ["a", "b"],
        present: "c",
        future: ["d"],
      };
      const next = historyReducer(state, { type: "UNDO" });
      expect(next.present).toBe("b");
      expect(next.past).toEqual(["a"]);
      expect(next.future).toEqual(["c", "d"]);
    });
  });

  describe("REDO", () => {
    it("is a no-op when future is empty", () => {
      const state: HistoryState<S> = { past: ["a"], present: "b", future: [] };
      const next = historyReducer(state, { type: "REDO" });
      expect(next).toBe(state); // same reference — no change
    });

    it("moves present to end of past and shifts first future as present", () => {
      const state: HistoryState<S> = {
        past: ["a"],
        present: "b",
        future: ["c", "d"],
      };
      const next = historyReducer(state, { type: "REDO" });
      expect(next.present).toBe("c");
      expect(next.past).toEqual(["a", "b"]);
      expect(next.future).toEqual(["d"]);
    });

    it("evicts oldest past entry when cap is reached during redo", () => {
      const past = Array.from({ length: HISTORY_STACK_SIZE }, (_, i) => `s${i}`);
      const state: HistoryState<S> = { past, present: "current", future: ["next"] };
      const next = historyReducer(state, { type: "REDO" });
      expect(next.past).toHaveLength(HISTORY_STACK_SIZE);
      expect(next.past[0]).toBe("s1"); // oldest evicted
      expect(next.present).toBe("next");
    });
  });

  describe("PUSH after UNDO (fork — REQ-05)", () => {
    it("discards all future entries when pushing after an undo", () => {
      // Start: a → b → c, undo twice → sitting at a with future [b, c]
      let state: HistoryState<S> = { past: [], present: "a", future: [] };
      state = historyReducer(state, { type: "PUSH", payload: "b" });
      state = historyReducer(state, { type: "PUSH", payload: "c" });
      state = historyReducer(state, { type: "UNDO" });
      state = historyReducer(state, { type: "UNDO" });
      expect(state.present).toBe("a");
      expect(state.future).toEqual(["b", "c"]);

      // Now push a new entry — future must be discarded.
      state = historyReducer(state, { type: "PUSH", payload: "x" });
      expect(state.present).toBe("x");
      expect(state.past).toEqual(["a"]);
      expect(state.future).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// useHistory — React hook wrapper tests
// ---------------------------------------------------------------------------

describe("useHistory hook", () => {
  it("initialises with null present, empty past and future", () => {
    const { result } = renderHook(() => useHistory<S>());
    expect(result.current.state.present).toBeNull();
    expect(result.current.state.past).toHaveLength(0);
    expect(result.current.state.future).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("push sets present without creating a past entry on first call", () => {
    const { result } = renderHook(() => useHistory<S>());
    act(() => result.current.push("a"));
    expect(result.current.state.present).toBe("a");
    expect(result.current.state.past).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("push moves present into past on subsequent calls", () => {
    const { result } = renderHook(() => useHistory<S>());
    act(() => result.current.push("a"));
    act(() => result.current.push("b"));
    expect(result.current.state.present).toBe("b");
    expect(result.current.state.past).toEqual(["a"]);
    expect(result.current.canUndo).toBe(true);
  });

  it("setPresent replaces present without touching past or future", () => {
    const { result } = renderHook(() => useHistory<S>());
    act(() => result.current.push("a"));
    act(() => result.current.push("b"));
    act(() => result.current.setPresent("z"));
    expect(result.current.state.present).toBe("z");
    expect(result.current.state.past).toEqual(["a"]);
    expect(result.current.state.future).toHaveLength(0);
    expect(result.current.canUndo).toBe(true); // past unchanged
  });

  it("undo is a no-op when past is empty", () => {
    const { result } = renderHook(() => useHistory<S>());
    act(() => result.current.push("a"));
    act(() => result.current.undo());
    expect(result.current.state.present).toBe("a"); // unchanged
    expect(result.current.canUndo).toBe(false);
  });

  it("undo restores the previous present", () => {
    const { result } = renderHook(() => useHistory<S>());
    act(() => result.current.push("a"));
    act(() => result.current.push("b"));
    act(() => result.current.undo());
    expect(result.current.state.present).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo is a no-op when future is empty", () => {
    const { result } = renderHook(() => useHistory<S>());
    act(() => result.current.push("a"));
    act(() => result.current.redo());
    expect(result.current.state.present).toBe("a"); // unchanged
    expect(result.current.canRedo).toBe(false);
  });

  it("redo restores the previously undone present", () => {
    const { result } = renderHook(() => useHistory<S>());
    act(() => result.current.push("a"));
    act(() => result.current.push("b"));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.state.present).toBe("b");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("canUndo / canRedo track state correctly through a full cycle", () => {
    const { result } = renderHook(() => useHistory<S>());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.push("a"));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.push("b"));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });
});
