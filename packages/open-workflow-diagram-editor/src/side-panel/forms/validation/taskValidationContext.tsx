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
import type { TaskValidationResult } from "./taskLevelValidation";

export interface TaskValidationState {
  /** True after the first Apply click attempted validation (the "latch"). */
  attempted: boolean;
  /** Form-field paths with schema errors. */
  fieldErrors: Record<string, string>;
  /** Container paths with level errors ("" = task root). */
  levelErrors: Record<string, string>;
  /** True when an unparseable valueMap enum payload is present (non-bypassable). */
  hasUnparseableValueMapPayload: boolean;
}

export const INITIAL_TASK_VALIDATION_STATE: TaskValidationState = {
  attempted: false,
  fieldErrors: {},
  levelErrors: {},
  hasUnparseableValueMapPayload: false,
};

export interface TaskValidationContextValue {
  taskValidation: TaskValidationState;
  /** Total number of unique error paths (field errors + level errors). */
  errorCount: number;
  /** Records a validation result into state, optionally updating the attempted flag. */
  recordValidationResult: (result: TaskValidationResult, attempted?: boolean) => void;
  /** Sets the attempted flag (e.g. on Apply click). */
  setAttempted: (attempted: boolean) => void;
  /** Resets validation state to initial clean state. */
  resetValidation: () => void;
}

const TaskValidationContext = React.createContext<TaskValidationContextValue | undefined>(
  undefined,
);

export function TaskValidationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<TaskValidationState>(INITIAL_TASK_VALIDATION_STATE);

  const resetValidation = React.useCallback(() => {
    setState(INITIAL_TASK_VALIDATION_STATE);
  }, []);

  const setAttempted = React.useCallback((attempted: boolean) => {
    setState((prev) => (prev.attempted === attempted ? prev : { ...prev, attempted }));
  }, []);

  const recordValidationResult = React.useCallback(
    (result: TaskValidationResult, attempted?: boolean) => {
      setState((prev) => ({
        attempted: attempted !== undefined ? attempted : prev.attempted,
        fieldErrors: result.fieldErrors,
        levelErrors: result.levelErrors,
        hasUnparseableValueMapPayload: result.hasUnparseableValueMapPayload,
      }));
    },
    [],
  );

  const errorCount = React.useMemo(
    () => Object.keys(state.fieldErrors).length + Object.keys(state.levelErrors).length,
    [state.fieldErrors, state.levelErrors],
  );

  const value = React.useMemo<TaskValidationContextValue>(
    () => ({
      taskValidation: state,
      errorCount,
      recordValidationResult,
      setAttempted,
      resetValidation,
    }),
    [state, errorCount, recordValidationResult, setAttempted, resetValidation],
  );

  return <TaskValidationContext.Provider value={value}>{children}</TaskValidationContext.Provider>;
}

const DEFAULT_TASK_VALIDATION_CONTEXT: TaskValidationContextValue = {
  taskValidation: INITIAL_TASK_VALIDATION_STATE,
  errorCount: 0,
  recordValidationResult: () => {},
  setAttempted: () => {},
  resetValidation: () => {},
};

export function useTaskValidation(): TaskValidationContextValue {
  const context = React.useContext(TaskValidationContext);
  return context ?? DEFAULT_TASK_VALIDATION_CONTEXT;
}

/**
 * Returns level-error information for a container path:
 * - `message`: the error message on this container, if any
 * - `count`: the number of level errors at or below this container path
 */
export function useLevelErrors(path: string): { message: string | undefined; count: number } {
  const { taskValidation } = useTaskValidation();
  const levelErrors = taskValidation.levelErrors;

  return React.useMemo(() => {
    const message = levelErrors[path];
    let count = 0;
    for (const key of Object.keys(levelErrors)) {
      if (path === "" || key === path || key.startsWith(`${path}.`)) {
        count++;
      }
    }
    return { message, count };
  }, [levelErrors, path]);
}
