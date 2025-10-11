import { NextResponse } from "next/server";
import { settingsRepository } from "@/lib/db/repositories";
import type { Settings } from "@/types";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/settings - Get user settings (or create default if none exists)
export async function GET() {
  try {
    let settings = await settingsRepository.get();

    // If no settings exist, create default settings
    if (!settings) {
      settings = await settingsRepository.create({
        defaultPriority: "medium",
        defaultBucket: "todo",
        defaultDueDate: "today",
        heatDecayHalfLifeTodo: 48,
        heatDecayHalfLifeWatch: 168,
        heatDecayHalfLifeLater: 720,
        activityNormalizationConstant: 20,
        newTaskHeatBoost: 0.7,
        newTaskHeatHalfLife: 24,
        escalationThreshold: 0.75,
        deEscalationThresholdTodoWatch: 0.25,
        deEscalationThresholdWatchLater: 0.15,
        retirementThreshold: 0.05,
        retirementDays: 90,
        reviewCadenceWatch: 7,
        reviewCadenceLater: 30,
        snoozeTodoDays: 1,
        snoozeWatchDays: 7,
        snoozeLaterDays: 30,
        groupingMode: "ungrouped",
      });
    }

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

    // Get or create settings
    let settings = await settingsRepository.get();
    if (!settings) {
      // Create default settings first
      settings = await settingsRepository.create({
        defaultPriority: "medium",
        defaultBucket: "todo",
        defaultDueDate: "today",
        heatDecayHalfLifeTodo: 48,
        heatDecayHalfLifeWatch: 168,
        heatDecayHalfLifeLater: 720,
        activityNormalizationConstant: 20,
        newTaskHeatBoost: 0.7,
        newTaskHeatHalfLife: 24,
        escalationThreshold: 0.75,
        deEscalationThresholdTodoWatch: 0.25,
        deEscalationThresholdWatchLater: 0.15,
        retirementThreshold: 0.05,
        retirementDays: 90,
        reviewCadenceWatch: 7,
        reviewCadenceLater: 30,
        snoozeTodoDays: 1,
        snoozeWatchDays: 7,
        snoozeLaterDays: 30,
        groupingMode: "ungrouped",
      });
    }

    // Update settings
    const updatedSettings = await settingsRepository.update(settings.id, body);

    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
