import type { ApiClient } from "./client";
import type { SettingsDTO, UpdateSettingsDTO } from "@toasty/contracts";

export interface SettingsResponse {
  settings: SettingsDTO;
}

export class SettingsApi {
  constructor(private client: ApiClient) {}

  /**
   * Get current user settings
   */
  async get(): Promise<SettingsResponse> {
    return this.client.get<SettingsResponse>("/api/settings");
  }

  /**
   * Update user settings
   */
  async update(data: UpdateSettingsDTO): Promise<SettingsResponse> {
    return this.client.patch<SettingsResponse>("/api/settings", data);
  }
}
