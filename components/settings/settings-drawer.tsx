"use client";

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateSettings } from "@/lib/queries/use-settings-mutations";
import type { Settings as SettingsType } from "@/types";

interface SettingsDrawerProps {
  initialSettings: SettingsType | null;
  onSettingsChange?: (settings: SettingsType) => void;
  // Optional props for controlled mode (when triggered from dropdown)
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Hide trigger when controlled externally
  hideTrigger?: boolean;
}

export function SettingsDrawer({
  initialSettings,
  onSettingsChange,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: SettingsDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled state if provided, otherwise use internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [settings, setSettings] = useState<SettingsType | null>(initialSettings);

  const updateSettingsMutation = useUpdateSettings();

  // Sync local state when initialSettings changes
  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  const handleSave = async () => {
    if (!settings) return;

    try {
      await updateSettingsMutation.mutateAsync(settings);
      onSettingsChange?.(settings);

      // Close drawer on successful save
      setIsOpen(false);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const updateSetting = <K extends keyof SettingsType>(
    key: K,
    value: SettingsType[K]
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {!hideTrigger && (
        <SheetTrigger asChild>
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </SheetTrigger>
      )}
      <SheetContent className="w-[400px] overflow-y-auto px-6 sm:w-[540px]">
        <SheetHeader className="space-y-3 pb-6">
          <SheetTitle className="text-2xl">Settings</SheetTitle>
          <SheetDescription className="text-base">
            Configure default values and preferences for new tasks
          </SheetDescription>
        </SheetHeader>

        {settings ? (
          <div className="space-y-8 pr-2">
            {/* Default Task Values Section */}
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <div className="mb-6 space-y-2">
                <h3 className="text-lg font-semibold tracking-tight">Default Task Values</h3>
                <p className="text-sm text-muted-foreground">
                  Set default values for newly created tasks
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="defaultPriority" className="text-sm font-medium">
                    Default Priority
                  </Label>
                  <Select
                    value={settings.defaultPriority}
                    onValueChange={(value) =>
                      updateSetting("defaultPriority", value as SettingsType["defaultPriority"])
                    }
                  >
                    <SelectTrigger id="defaultPriority" className="h-11 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="top">Top</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="defaultBucket" className="text-sm font-medium">
                    Default Bucket
                  </Label>
                  <Select
                    value={settings.defaultBucket}
                    onValueChange={(value) =>
                      updateSetting("defaultBucket", value as SettingsType["defaultBucket"])
                    }
                  >
                    <SelectTrigger id="defaultBucket" className="h-11 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">Todo</SelectItem>
                      <SelectItem value="watch">Watch</SelectItem>
                      <SelectItem value="later">Later</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="defaultDueDate" className="text-sm font-medium">
                    Default Due Date
                  </Label>
                  <Select
                    value={settings.defaultDueDate}
                    onValueChange={(value) =>
                      updateSetting("defaultDueDate", value as SettingsType["defaultDueDate"])
                    }
                  >
                    <SelectTrigger id="defaultDueDate" className="h-11 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="tomorrow">Tomorrow</SelectItem>
                      <SelectItem value="next_week">Next Week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 pr-2">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="h-11 px-8 text-base"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateSettingsMutation.isPending}
                className="h-11 px-8 text-base"
              >
                {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
