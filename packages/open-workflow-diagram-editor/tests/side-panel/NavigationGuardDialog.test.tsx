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
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditSession } from "../../src/side-panel/EditSession";
import { NavigationGuardDialog } from "../../src/side-panel/NavigationGuardDialog";
import { renderWithProviders } from "../test-utils/render-helpers";
import { en } from "../../src/i18n/locales/en";

function GuardHarness({ proceed }: { proceed: () => void }) {
 const { form, requestNavigation } = useEditSession();

 return (
   <>
     <button
       type="button"
       onClick={() => {
         form.setValue("anyField", "edited", { shouldDirty: true });
         requestNavigation(proceed);
       }}
     >
       Navigate with unsaved edits
     </button>
     <button type="button" onClick={() => requestNavigation(proceed)}>
       Navigate
     </button>
   </>
 );
}

const renderDialog = () => {
 const proceed = vi.fn();

 renderWithProviders(
   <>
     <GuardHarness proceed={proceed} />
     <NavigationGuardDialog />
   </>,
   { isReadOnly: false },
 );

 return { proceed, user: userEvent.setup() };
};

const dialog = () => screen.queryByRole("alertdialog");

const navigate = (user: ReturnType<typeof userEvent.setup>, dirty = false) =>
 user.click(
   screen.getByRole("button", { name: dirty ? "Navigate with unsaved edits" : "Navigate" }),
 );

describe("NavigationGuardDialog", () => {
 it("does not render when draft is clean", async () => {
   const { proceed, user } = renderDialog();

   await navigate(user);

   expect(dialog()).not.toBeInTheDocument();
   expect(proceed).toHaveBeenCalledOnce();
 });

 it("renders dialog when draft is dirty", async () => {
   const { user } = renderDialog();

   await navigate(user, true);

   expect(dialog()).toBeInTheDocument();
   expect(screen.getByText(en["sidebar.guard.title"])).toBeInTheDocument();
   expect(screen.getByText(en["sidebar.guard.description"])).toBeInTheDocument();
 });

 it("proceeds with navigation when discard is confirmed", async () => {
   const { proceed, user } = renderDialog();
   await navigate(user, true);

   await user.click(screen.getByRole("button", { name: en["sidebar.guard.discard"] }));

   expect(dialog()).not.toBeInTheDocument();
   expect(proceed).toHaveBeenCalledOnce();
 });

 it("does not proceed with navigation when keep editing is confirmed", async () => {
   const { proceed, user } = renderDialog();
   await navigate(user, true);

   await user.click(screen.getByRole("button", { name: en["sidebar.guard.keepEditing"] }));

   expect(dialog()).not.toBeInTheDocument();
   expect(proceed).not.toHaveBeenCalled();
 });
});
