import { useQuery } from "@tanstack/react-query";
import type { Settings } from "@/types";

interface SettingsResponse {
  settings: Settings;
}

async function fetchSettings(): Promise<Settings> {
  const response = await fetch("/api/settings");

  if (!response.ok) {
    throw new Error("Failed to fetch settings");
  }

  const data: SettingsResponse = await response.json();
  return data.settings;
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    // Settings are very stable - minimize refetches
    refetchOnWindowFocus: false,
    // Keep settings in cache longer
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
