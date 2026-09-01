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
import { cn } from "@/lib/utils";

/**
 * A native <select> element styled to match the form Input component.
 * Always shows the currently selected option — no click-to-reveal required.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        // Match Input sizing and border treatment exactly
        "dec:h-9 dec:w-full dec:min-w-0 dec:rounded-md dec:border dec:border-input dec:bg-transparent",
        "dec:px-3 dec:py-1 dec:text-base dec:shadow-xs dec:transition-[color,box-shadow] dec:outline-none",
        "dec:text-foreground dec:md:text-sm",
        // Chevron — provided by the browser; add right padding so text doesn't overlap it
        "dec:pr-8",
        // Dark mode background so the dropdown matches the panel
        "dec:dark:bg-[#1f2937]",
        // Focus ring identical to Input
        "dec:focus-visible:border-ring dec:focus-visible:ring-[3px] dec:focus-visible:ring-ring/50",
        // Disabled state
        "dec:disabled:pointer-events-none dec:disabled:cursor-not-allowed dec:disabled:opacity-50",
        // Cursor
        "dec:cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
