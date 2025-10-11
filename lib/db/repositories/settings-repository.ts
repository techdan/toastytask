import { eq } from "drizzle-orm";
import type { ISettingsRepository } from "./interfaces";
import type { Settings, NewSettings } from "@/lib/db/schema";
import { settings } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

export class SQLiteSettingsRepository implements ISettingsRepository {
  private db = getDatabase();

  async get(): Promise<Settings> {
    // Always return the first (and only) row
    const [settingsRow] = await this.db.select().from(settings).limit(1);

    // If no settings exist, create default settings
    if (!settingsRow) {
      return this.reset();
    }

    return settingsRow;
  }

  async update(updates: Partial<NewSettings>): Promise<Settings> {
    const existingSettings = await this.get();

    const [updatedSettings] = await this.db
      .update(settings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(settings.id, existingSettings.id))
      .returning();

    return updatedSettings;
  }

  async reset(): Promise<Settings> {
    // Delete all existing settings
    await this.db.delete(settings);

    // Create new default settings
    const [defaultSettings] = await this.db
      .insert(settings)
      .values({
        updatedAt: new Date(),
        // All other fields will use schema defaults
      })
      .returning();

    return defaultSettings;
  }
}
