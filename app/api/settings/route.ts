import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { settingsRepository } from "@/lib/db/repositories";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/settings - Get user settings (or create default if none exists)
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // get() automatically creates default settings if none exist for this user
    const settings = await settingsRepository.get(userId);

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// PATCH /api/settings - Update user settings
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // get() automatically creates default settings if none exist
    // update() doesn't need an id parameter - it updates the user's settings
    const updatedSettings = await settingsRepository.update(body, userId);

    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
