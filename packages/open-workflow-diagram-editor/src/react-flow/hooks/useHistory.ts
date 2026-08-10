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

import * as React from "react";

/**
 * Maximum number of past snapshots retained in the history stack.
 * Oldest entries are evicted when the cap is reached.
 */
export const HISTORY_STACK_SIZE = 10;

export type HistoryState<T> = {
  /** Past snapshots, oldest first. Length is capped at HISTORY_STACK_SIZE. */
  past: T[];
  /** The current snapshot. Null when the history has not been initialised yet. */
  present: T | null;
  /** Future snapshots available for redo. Index 0 is the most recently undone entry. */
  future: T[];
};

type HistoryAction<T> =
  | { type: "PUSH"; payload: T }
  | { type: "SET_PRESENT"; payload: T }
  | { type: "UNDO" }
  | { type: "REDO" };

/**
 * Appends `entry` to `past`, evicting the oldest entry when the stack cap is reached.
 * Used by both PUSH and REDO to keep the capping logic in one place.
 */
function appendCapped<T>(past: T[], entry: T): T[] {
  return [...(past.length >= HISTORY_STACK_SIZE ? past.slice(1) : past), entry];
}

export function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case "PUSH": {
      // Discard the future (branch pruning).
      // If present is non-null, move it into past (capped).
      const newPast = state.present !== null ? appendCapped(state.past, state.present) : state.past;

      return {
        past: newPast,
        present: action.payload,
        future: [],
      };
    }

    case "SET_PRESENT": {
      // Replace present without touching past or future.
      // Used in read-only mode so the diagram renders new content
      // without creating any undoable history entry.
      return { ...state, present: action.payload };
    }

    case "UNDO": {
      // Guard: nothing to undo.
      if (state.past.length === 0) return state;

      const previous = state.past[state.past.length - 1]!;
      const newPast = state.past.slice(0, -1);
      const newFuture = state.present !== null ? [state.present, ...state.future] : state.future;

      return {
        past: newPast,
        present: previous,
        future: newFuture,
      };
    }

    case "REDO": {
      // Guard: nothing to redo.
      if (state.future.length === 0) return state;

      const next = state.future[0]!;
      const newFuture = state.future.slice(1);
      const newPast = state.present !== null ? appendCapped(state.past, state.present) : state.past;

      return {
        past: newPast,
        present: next,
        future: newFuture,
      };
    }

    default:
      return state;
  }
}

const initialHistoryState = <T>(): HistoryState<T> => ({
  past: [],
  present: null,
  future: [],
});

export type UseHistoryReturn<T> = {
  state: HistoryState<T>;
  push: (payload: T) => void;
  setPresent: (payload: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/**
 * Generic past/present/future history hook backed by useReducer.
 * Starts uninitialised (present = null). The first push sets the
 * initial present without adding a past entry.
 */
export function useHistory<T>(): UseHistoryReturn<T> {
  const [state, dispatch] = React.useReducer(
    historyReducer as React.Reducer<HistoryState<T>, HistoryAction<T>>,
    undefined,
    initialHistoryState<T>,
  );

  const push = React.useCallback((payload: T) => {
    dispatch({ type: "PUSH", payload });
  }, []);

  const setPresent = React.useCallback((payload: T) => {
    dispatch({ type: "SET_PRESENT", payload });
  }, []);

  const undo = React.useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  const redo = React.useCallback(() => {
    dispatch({ type: "REDO" });
  }, []);

  return {
    state,
    push,
    setPresent,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
