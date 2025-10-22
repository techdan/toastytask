import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Settings } from "@/types";

interface SettingsResponse {
  settings: Settings;
}

// Update settings
async function updateSettings(updates: Partial<Settings>): Promise<Settings> {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error("Failed to update settings");
  }

  const data: SettingsResponse = await response.json();
  return data.settings;
}

// Hook: Update settings with optimistic update
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSettings,
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["settings"] });

      // Snapshot previous value
      const previousSettings = queryClient.getQueryData<Settings>([
        "settings",
      ]);

      // Optimistically update settings
      queryClient.setQueryData<Settings>(["settings"], (oldSettings) => {
        if (!oldSettings) return oldSettings;
        return { ...oldSettings, ...updates };
      });

      return { previousSettings };
    },
    onSuccess: () => {
      toast.success("Settings updated successfully");
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(["settings"], context.previousSettings);
      }
      toast.error("Failed to update settings", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
