import type { Task } from "@/types";

/**
 * Heat v2 - Dynamic task scoring with interaction tracking
 *
 * ⚠️ SINGLE SOURCE OF TRUTH ⚠️
 * This is the ONLY place where heat calculation logic should exist.
 *
 * Architecture:
 * - SERVER: Always calculates and stores heat in DB (source of truth)
 * - CLIENT: Uses server-provided value from task.heat
 * - CLIENT OPTIMISTIC UPDATES: May temporarily recalculate for immediate UI feedback,
 *   but server response will always replace with authoritative value
 *
 * Heat range: 0.0-1.0
 *
 * 6-Component Formula (REFINED - see docs/heat-algorithm-analysis.md):
 * heat = clamp(
 *   0.50 * base_importance +      // Priority + star - PRIMARY DRIVER (was 20%)
 *   0.05 * recency +               // Any touch decay - minor boost (was 25%)
 *   0.30 * heat_touches +          // 20 clicks = max (powerful override) - UNCHANGED
 *   0.05 * due_proximity +         // Sigmoid curve urgency (was 15%)
 *   0.05 * activity +              // Other touches (edits) - UNCHANGED
 *   0.05 * creation_recency,       // Minimal (uses sort override) - UNCHANGED
 *   0, 1
 * )
 *
 * Key Features:
 * - Split touch tracking: heat_touch_count (🔥 icon) vs other_touch_count (edits)
 * - Decay-on-touch: Prevents zombie heat, counter represents "equivalent fresh touches"
 * - Due proximity: Sigmoid curve ensures impending deadlines bubble up
 * - Projected decay on snooze: Natural cooling that scales with snooze duration
 * - New task override: Untouched tasks (both counters = 0) always sort to top
 *
 * See: docs/heat-requirements-v2.md for detailed specification
 */

// ============================================================================
// Constants (Easily Adjustable)
// ============================================================================

/**
 * Core decay settings
 */
export const HEAT_DECAY_HALF_LIFE_HOURS = 168; // 7 days for general recency
export const HEAT_TOUCH_DECAY_HALF_LIFE_HOURS = 168; // 7 days for heat touch power
export const HEAT_TOUCH_CAP = 20; // 20 heat clicks = maximum power
export const ACTIVITY_CAP = 20; // 20 other touches = maximum
export const CREATION_DECAY_DAYS = 60; // Creation boost diminishes over 60 days

/**
 * Component weights (must sum to 1.0)
 * UPDATED: Refined weights based on analysis (see docs/heat-algorithm-analysis.md)
 * - Base importance increased from 20% → 50% (primary driver)
 * - Recency decreased from 25% → 5% (prevents snooze from increasing heat)
 * - Due proximity decreased from 15% → 5% (avoid double-counting with importanceV1)
 */
export const WEIGHT_BASE = 0.50; // Base importance (priority + star) - PRIMARY DRIVER
export const WEIGHT_RECENCY = 0.05; // Time since any touch - minor boost only
export const WEIGHT_HEAT_TOUCHES = 0.30; // Heat icon clicks (powerful override)
export const WEIGHT_DUE_PROXIMITY = 0.05; // Due date urgency - minimal (importanceV1 has this)
export const WEIGHT_ACTIVITY = 0.05; // Other touches (edits)
export const WEIGHT_CREATION = 0.05; // Creation recency (minimal, uses sort override)

/**
 * Cold storage thresholds
 */
export const COLD_STORAGE_HEAT_THRESHOLD = 0.05;
export const COLD_STORAGE_DAYS_THRESHOLD = 90;

/**
 * Snooze/resurface settings
 */
export const SNOOZE_PROXIMITY_BOOST_MAX = 0.30; // Maximum heat boost on resurface date
export const SNOOZE_PROXIMITY_WINDOW_DAYS = 7; // Days before resurface when boost starts

/**
 * Staleness refresh threshold (single list)
 */
export const HEAT_STALENESS_HOURS = 6; // Recalculate if older than 6 hours

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Breakdown of heat components for tooltip display
 */
export interface HeatBreakdown {
  // Raw component values (before weighting)
  baseImportance: number; // 0-1
  recency: number; // 0-1
  heatTouches: number; // 0-1
  dueProximity: number; // 0-1
  activity: number; // 0-1
  creation: number; // 0-1

  // Weighted contributions
  baseImportanceWeighted: number; // baseImportance * WEIGHT_BASE
  recencyWeighted: number; // recency * WEIGHT_RECENCY
  heatTouchesWeighted: number; // heatTouches * WEIGHT_HEAT_TOUCHES
  dueProximityWeighted: number; // dueProximity * WEIGHT_DUE_PROXIMITY
  activityWeighted: number; // activity * WEIGHT_ACTIVITY
  creationWeighted: number; // creation * WEIGHT_CREATION

  // Final score
  totalHeat: number; // 0-1, clamped
}

/**
 * Heat stage for visual display
 */
export type HeatStage = "hot" | "warm" | "cooling" | "cool" | "cold" | "freezing";

/**
 * Result of decay-on-touch calculation
 */
export interface DecayOnTouchResult {
  decayFactor: number; // e.g., 0.5 for 7-day half-life after 7 days
  newCount: number; // (oldCount * decayFactor) + 1
}

/**
 * Result of snooze projected decay calculation
 */
export interface SnoozeDecayResult {
  decayFactor: number; // e.g., 0.37 for 7-day snooze
  newCount: number; // oldCount * decayFactor
  touchesRetained: number; // Same as newCount, for clarity
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert various date formats to Date object
 */
function toDate(dateValue: Date | number | string | null | undefined): Date | null {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return dateValue;
  } else if (typeof dateValue === "number") {
    // Unix timestamp in seconds (SQLite format) or milliseconds
    const timestamp = dateValue < 10000000000 ? dateValue * 1000 : dateValue;
    return new Date(timestamp);
  } else if (typeof dateValue === "string") {
    return new Date(dateValue);
  }

  return null;
}

/**
 * Calculate hours between two dates
 */
function hoursBetween(date1: Date, date2: Date): number {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60);
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
}

// ============================================================================
// Component Calculations
// ============================================================================

/**
 * 1. Base Importance (20% weight)
 * Maps importance_v1 (2-12 range) → 0.0-1.0 linearly
 */
function calculateBaseImportance(importanceV1: number): number {
  // importance_v1 ranges from 2 to 12
  return clamp((importanceV1 - 2) / 10, 0, 1);
}

/**
 * 2. Recency Score (5% weight - reduced from 25%)
 * Exponential decay based on time since ANY touch (heat or other)
 * Formula: exp(-hours_since_touch / H)
 * Default half-life (H): 168 hours (7 days)
 *
 * CRITICAL FIX: Returns 0 if task is snoozed (nextSurfaceAt is set)
 * This prevents snooze action from INCREASING heat via recency update
 */
function calculateRecency(
  lastTouchedAt: Date | null,
  nextSurfaceAt: Date | null,
  now: Date = new Date()
): number {
  // Force recency to 0 while snoozed - prevents snooze from increasing heat
  if (nextSurfaceAt) {
    const nextSurfaceDate = toDate(nextSurfaceAt);
    if (nextSurfaceDate && nextSurfaceDate.getTime() > now.getTime()) {
      return 0; // Task is snoozed, ignore recency
    }
  }

  if (!lastTouchedAt) {
    return 0; // Never touched
  }

  const hoursSinceTouch = hoursBetween(lastTouchedAt, now);
  return Math.exp(-hoursSinceTouch / HEAT_DECAY_HALF_LIFE_HOURS);
}

/**
 * 3. Heat Touches (30% weight) - THE "OVERRIDE" COMPONENT
 * Linear scaling of heat icon clicks only (🔥)
 * Formula: min(heat_touch_count / 20, 1.0) * 0.30
 * Caps at 20 equivalent clicks for maximum power
 *
 * Note: heat_touch_count already has decay applied before each increment
 * This function just scales the count to 0-1 range
 */
function calculateHeatTouches(heatTouchCount: number): number {
  return clamp(heatTouchCount / HEAT_TOUCH_CAP, 0, 1);
}

/**
 * 4. Due Proximity (15% weight)
 * Sigmoid function of days until due date
 * Formula: 1 / (1 + exp(days_to_due))
 * Ensures impending deadlines bubble up
 * Past-due tasks stay hot (not penalized)
 */
function calculateDueProximity(dueAt: Date | null, now: Date = new Date()): number {
  if (!dueAt) {
    return 0; // No due date
  }

  // Calculate days to due (can be negative if past due)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  const diffMs = dueStart.getTime() - todayStart.getTime();
  const daysToDue = diffMs / (1000 * 60 * 60 * 24);

  // Sigmoid curve: 1 / (1 + exp(days_to_due))
  // When days_to_due is negative (past due), exp is large, result approaches 1
  // When days_to_due is 0 (today), result is 0.5
  // When days_to_due is positive (future), exp is small, result approaches 0
  return 1 / (1 + Math.exp(daysToDue));
}

/**
 * 5. Activity Score (5% weight)
 * Logarithmic scaling of OTHER touches (not heat icon)
 * Formula: log(1 + other_touch_count) / log(1 + T) where T=20
 * Caps at 20 touches
 */
function calculateActivity(otherTouchCount: number): number {
  if (otherTouchCount === 0) {
    return 0;
  }

  const cappedCount = Math.min(otherTouchCount, ACTIVITY_CAP);
  return Math.log(1 + cappedCount) / Math.log(1 + ACTIVITY_CAP);
}

/**
 * 6. Creation Recency (5% weight)
 * Formula: exp(-days_since_created / 60) * max(0, 1 - (heat_touch_count + other_touch_count))
 * Drops to zero after ANY touch
 *
 * Note: New tasks use sort override for top placement
 * This component provides slight boost if untouched for extended period
 */
function calculateCreationRecency(
  createdAt: Date,
  heatTouchCount: number,
  otherTouchCount: number,
  now: Date = new Date()
): number {
  const totalTouches = heatTouchCount + otherTouchCount;
  if (totalTouches > 0) {
    return 0; // Drops to zero after any touch
  }

  const daysSinceCreated = daysBetween(createdAt, now);
  return Math.exp(-daysSinceCreated / CREATION_DECAY_DAYS);
}

// ============================================================================
// Main Heat Calculation
// ============================================================================

/**
 * Calculate heat score for a task
 * Returns a value between 0.0 and 1.0
 */
export function calculateHeat(
  task: Pick<
    Task,
    | "importanceV1"
    | "heatTouchCount"
    | "otherTouchCount"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
    | "dueAt"
    | "createdAt"
    | "nextSurfaceAt"
  >,
  now: Date = new Date()
): number {
  // Convert dates
  const lastTouchedDate = toDate(task.lastTouchedAt);
  const dueDate = toDate(task.dueAt);
  const createdDate = toDate(task.createdAt) || now;
  const nextSurfaceDate = toDate(task.nextSurfaceAt);

  // Calculate each component (0-1 range)
  const baseImportance = calculateBaseImportance(task.importanceV1);
  const recency = calculateRecency(lastTouchedDate, nextSurfaceDate, now);
  const heatTouches = calculateHeatTouches(task.heatTouchCount);
  const dueProximity = calculateDueProximity(dueDate, now);
  const activity = calculateActivity(task.otherTouchCount);
  const creation = calculateCreationRecency(
    createdDate,
    task.heatTouchCount,
    task.otherTouchCount,
    now
  );

  // Calculate weighted sum
  let heat =
    WEIGHT_BASE * baseImportance +
    WEIGHT_RECENCY * recency +
    WEIGHT_HEAT_TOUCHES * heatTouches +
    WEIGHT_DUE_PROXIMITY * dueProximity +
    WEIGHT_ACTIVITY * activity +
    WEIGHT_CREATION * creation;

  // If snoozed, add proximity boost as resurface date approaches
  if (nextSurfaceDate) {
    const hoursUntilResurface = (nextSurfaceDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const daysUntilResurface = hoursUntilResurface / 24;

    // Apply proximity boost within 7 days of resurface
    if (daysUntilResurface <= SNOOZE_PROXIMITY_WINDOW_DAYS) {
      if (daysUntilResurface <= 0) {
        // On or past resurface date: maximum boost
        heat = Math.min(1.0, heat + SNOOZE_PROXIMITY_BOOST_MAX);
      } else {
        // Approaching resurface: gradual boost
        const proximityBoost =
          SNOOZE_PROXIMITY_BOOST_MAX * (1 - daysUntilResurface / SNOOZE_PROXIMITY_WINDOW_DAYS);
        heat = Math.min(1.0, heat + proximityBoost);
      }
    }
  }

  return clamp(heat, 0, 1);
}

/**
 * Calculate heat score with detailed breakdown for tooltip display
 */
export function calculateHeatWithBreakdown(
  task: Pick<
    Task,
    | "importanceV1"
    | "heatTouchCount"
    | "otherTouchCount"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
    | "dueAt"
    | "createdAt"
    | "nextSurfaceAt"
  >,
  now: Date = new Date()
): HeatBreakdown {
  // Convert dates
  const lastTouchedDate = toDate(task.lastTouchedAt);
  const dueDate = toDate(task.dueAt);
  const createdDate = toDate(task.createdAt) || now;
  const nextSurfaceDate = toDate(task.nextSurfaceAt);

  // Calculate each component (0-1 range)
  const baseImportance = calculateBaseImportance(task.importanceV1);
  const recency = calculateRecency(lastTouchedDate, nextSurfaceDate, now);
  const heatTouches = calculateHeatTouches(task.heatTouchCount);
  const dueProximity = calculateDueProximity(dueDate, now);
  const activity = calculateActivity(task.otherTouchCount);
  const creation = calculateCreationRecency(
    createdDate,
    task.heatTouchCount,
    task.otherTouchCount,
    now
  );

  // Calculate weighted contributions
  const baseImportanceWeighted = WEIGHT_BASE * baseImportance;
  const recencyWeighted = WEIGHT_RECENCY * recency;
  const heatTouchesWeighted = WEIGHT_HEAT_TOUCHES * heatTouches;
  const dueProximityWeighted = WEIGHT_DUE_PROXIMITY * dueProximity;
  const activityWeighted = WEIGHT_ACTIVITY * activity;
  const creationWeighted = WEIGHT_CREATION * creation;

  // Calculate total heat (using the main function to ensure consistency)
  const totalHeat = calculateHeat(task, now);

  return {
    baseImportance,
    recency,
    heatTouches,
    dueProximity,
    activity,
    creation,
    baseImportanceWeighted,
    recencyWeighted,
    heatTouchesWeighted,
    dueProximityWeighted,
    activityWeighted,
    creationWeighted,
    totalHeat,
  };
}

// ============================================================================
// Decay Helpers
// ============================================================================

/**
 * Apply decay-on-touch to heat_touch_count
 * CRITICAL: Prevents zombie heat problem
 *
 * When user clicks heat icon:
 *   hours_since_last = (now - last_heat_touched_at) / 3600000
 *   decay_factor = exp(-hours_since_last / 168)  // 7-day half-life
 *   heat_touch_count = (heat_touch_count * decay_factor) + 1
 *   last_heat_touched_at = now
 *
 * Example: 20 touches, wait 7 days, touch once
 *   → (20 * 0.5) + 1 = 11 (NOT 21!)
 *
 * @param currentCount - Current heat_touch_count
 * @param lastHeatTouchedAt - Timestamp of last heat touch
 * @param now - Current timestamp (defaults to now)
 * @returns DecayOnTouchResult with decay factor and new count
 */
export function applyDecayToHeatTouches(
  currentCount: number,
  lastHeatTouchedAt: Date | null,
  now: Date = new Date()
): DecayOnTouchResult {
  if (currentCount === 0 || !lastHeatTouchedAt) {
    // No previous touches, just add 1
    return {
      decayFactor: 1,
      newCount: 1,
    };
  }

  const lastTouchDate = toDate(lastHeatTouchedAt);
  if (!lastTouchDate) {
    return {
      decayFactor: 1,
      newCount: currentCount + 1,
    };
  }

  const hoursSinceLast = hoursBetween(lastTouchDate, now);
  const decayFactor = Math.exp(-hoursSinceLast / HEAT_TOUCH_DECAY_HALF_LIFE_HOURS);

  // Apply decay to existing touches BEFORE adding new one
  const newCount = currentCount * decayFactor + 1;

  return {
    decayFactor,
    newCount,
  };
}

/**
 * Calculate projected decay for snooze
 * NEW: Natural time-based cooling that scales with snooze duration
 *
 * When user snoozes:
 *   days_snoozed = (next_surface_at - now) / 86400000
 *   hours_snoozed = days_snoozed * 24
 *   decay_factor = exp(-hours_snoozed / 168)
 *   heat_touch_count = heat_touch_count * decay_factor
 *   last_heat_touched_at = now
 *
 * Examples:
 *   - 7 day snooze: 20 touches → 20 * 0.37 = 7.4
 *   - 14 day snooze: 20 touches → 20 * 0.14 = 2.8
 *   - 30 day snooze: 20 touches → 20 * 0.06 = 1.2
 *
 * Rationale:
 *   - Natural and predictable decay
 *   - Scales with snooze duration
 *   - Preserves partial history
 *   - Task drops far enough to be "out of sight"
 *   - Allows early unsnooze with partial touches intact
 *
 * @param currentCount - Current heat_touch_count
 * @param nextSurfaceAt - When task should resurface
 * @param now - Current timestamp (defaults to now)
 * @returns SnoozeDecayResult with decay factor and new count
 */
export function calculateSnoozeDecay(
  currentCount: number,
  nextSurfaceAt: Date,
  now: Date = new Date()
): SnoozeDecayResult {
  if (currentCount === 0) {
    return {
      decayFactor: 1,
      newCount: 0,
      touchesRetained: 0,
    };
  }

  const nextSurfaceDate = toDate(nextSurfaceAt);
  if (!nextSurfaceDate) {
    return {
      decayFactor: 1,
      newCount: currentCount,
      touchesRetained: currentCount,
    };
  }

  const daysSnoozed = (nextSurfaceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const hoursSnoozed = daysSnoozed * 24;

  // Calculate decay factor based on snooze duration
  const decayFactor = Math.exp(-hoursSnoozed / HEAT_TOUCH_DECAY_HALF_LIFE_HOURS);

  // Apply projected decay
  const newCount = currentCount * decayFactor;

  return {
    decayFactor,
    newCount,
    touchesRetained: newCount,
  };
}

// ============================================================================
// Display Utilities
// ============================================================================

/**
 * Get heat stage for visual display
 * Maps 0-1 heat range to descriptive stages
 */
export function getHeatStage(heat: number): HeatStage {
  if (heat >= 0.70) return "hot"; // 0.70-1.0: Red
  if (heat >= 0.50) return "warm"; // 0.50-0.70: Orange
  if (heat >= 0.30) return "cooling"; // 0.30-0.50: Yellow
  if (heat >= 0.15) return "cool"; // 0.15-0.30: Blue
  if (heat >= 0.05) return "cold"; // 0.05-0.15: Light Blue
  return "freezing"; // <0.05: Gray
}

/**
 * Get color class based on heat stage
 */
export function getHeatColor(heat: number): string {
  const stage = getHeatStage(heat);

  switch (stage) {
    case "hot":
      return "bg-red-400";
    case "warm":
      return "bg-orange-400";
    case "cooling":
      return "bg-yellow-400";
    case "cool":
      return "bg-blue-400";
    case "cold":
      return "bg-cyan-300";
    case "freezing":
      return "bg-gray-300";
  }
}

/**
 * Get label for heat stage
 */
export function getHeatLabel(heat: number): string {
  const stage = getHeatStage(heat);

  switch (stage) {
    case "hot":
      return "Hot";
    case "warm":
      return "Warm";
    case "cooling":
      return "Cooling";
    case "cool":
      return "Cool";
    case "cold":
      return "Cold";
    case "freezing":
      return "Freezing";
  }
}

/**
 * Check if task is eligible for cold storage
 * Criteria: heat ≤ 0.05 for 90+ days
 */
export function isEligibleForColdStorage(
  heat: number,
  lastTouchedAt: Date | null,
  now: Date = new Date()
): boolean {
  if (heat > COLD_STORAGE_HEAT_THRESHOLD) {
    return false;
  }

  if (!lastTouchedAt) {
    return false; // Can't determine eligibility without touch history
  }

  const lastTouchDate = toDate(lastTouchedAt);
  if (!lastTouchDate) {
    return false;
  }

  const daysUntouched = daysBetween(lastTouchDate, now);
  return daysUntouched >= COLD_STORAGE_DAYS_THRESHOLD;
}

/**
 * Check if heat calculation is stale and needs refresh
 */
export function isHeatStale(heatCalculatedAt: Date | null, now: Date = new Date()): boolean {
  if (!heatCalculatedAt) {
    return true; // Never calculated
  }

  const calculatedDate = toDate(heatCalculatedAt);
  if (!calculatedDate) {
    return true;
  }

  const hoursSinceCalc = hoursBetween(calculatedDate, now);
  return hoursSinceCalc >= HEAT_STALENESS_HOURS;
}
