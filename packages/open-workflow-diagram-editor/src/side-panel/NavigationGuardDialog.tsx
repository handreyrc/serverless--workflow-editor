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

import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { TriangleAlert } from "lucide-react";
import { useI18n } from "@openworkflowspec/i18n";
import { Button } from "@/components/ui/button";
import { useEditSession } from "./EditSession";

export function NavigationGuardDialog() {
  const { t } = useI18n();
  const { isNavigationBlocked, confirmDiscard, cancelNavigation } = useEditSession();

  return (
    <AlertDialogPrimitive.Root
      open={isNavigationBlocked}
      onOpenChange={(open) => {
        if (!open) {
          cancelNavigation();
        }
      }}
    >
      <AlertDialogPrimitive.Overlay className="dec-sidebar-guard-overlay" />
      <AlertDialogPrimitive.Content className="dec-sidebar-guard-card">
        <AlertDialogPrimitive.Title className="dec-sidebar-guard-title">
          <TriangleAlert className="dec-sidebar-guard-icon" aria-hidden="true" />
          {t("sidebar.guard.title")}
        </AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="dec-sidebar-guard-description">
          {t("sidebar.guard.description")}
        </AlertDialogPrimitive.Description>
        <div className="dec-sidebar-guard-actions">
          <AlertDialogPrimitive.Cancel asChild>
            <Button type="button" variant="outline" size="sm">
              {t("sidebar.guard.keepEditing")}
            </Button>
          </AlertDialogPrimitive.Cancel>
          <Button type="button" variant="destructive" size="sm" onClick={confirmDiscard}>
            {t("sidebar.guard.discard")}
          </Button>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Root>
  );
}
