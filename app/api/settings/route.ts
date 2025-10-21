import { NextResponse } from "next/server";
import { settingsRepository } from "@/lib/db/repositories";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/settings - Get user settings (or create default if none exists)
export async function GET() {
  try {
    // get() automatically creates default settings if none exist
    const settings = await settingsRepository.get();

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// PATCH /api/settings - Update user settings
export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    // get() automatically creates default settings if none exist
    // update() doesn't need an id parameter - it updates the singleton settings
    const updatedSettings = await settingsRepository.update(body);

    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
