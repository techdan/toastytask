import { eq } from "drizzle-orm";
import type { ISettingsRepository } from "./interfaces";
import type { Settings, NewSettings } from "@/lib/db/schema";
import { settings } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

export class SQLiteSettingsRepository implements ISettingsRepository {
  private db = getDatabase();

  async get(userId: string): Promise<Settings> {
    // Get settings for the specific user
    const [settingsRow] = await this.db
      .select()
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);

    // If no settings exist for this user, create default settings
    if (!settingsRow) {
      return this.reset(userId);
    }

    return settingsRow;
  }

  async update(updates: Partial<NewSettings>, userId: string): Promise<Settings> {
    const existingSettings = await this.get(userId);

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

  async reset(userId: string): Promise<Settings> {
    // Delete existing settings for this user
    await this.db
      .delete(settings)
      .where(eq(settings.userId, userId));

    // Create new default settings for this user
    const [defaultSettings] = await this.db
      .insert(settings)
      .values({
        userId,
        updatedAt: new Date(),
        // All other fields will use schema defaults
      })
      .returning();

    return defaultSettings;
  }
}
