import type { Task } from "@/types";
import { HEAT_CONFIG, STAR_CONFIG, GLOW_CONFIG } from "./heat-config";
import { getMinImportance, getMaxImportance, getImportanceRange } from "./importance-v1";
import { getHeatColorFromConfig, getHeatLabelFromConfig } from "./importance-colors";

/**
 * Heat v3/v4 - Simplified 3-Component Model with Point-Based Normalization
 *
 * ⚠️ SINGLE SOURCE OF TRUTH ⚠️
 * This is the ONLY place where Heat v3/v4 calculation logic should exist.
 *
 * Radical simplification from V2:
 * - 3 components (vs 6 in V2): base importance (95 pts), heat adjustment (±45 pts), recency (5 pts)
 * - Direct heat tracking: heatAdjustment (-45 to +45) tracked in points
 * - Context-aware positioning: Heat moves up 1, Cool moves down 3 positions
 * - Asymmetric decay: Cool decays 2x faster (3-day vs 7-day half-life)
 * - Enhanced star: 3 levels (blue/yellow/orange) = +1/+2/+3 to base importance
 * - Removed: activity touches, due proximity, creation recency, snooze workflow
 *
 * V4 Formula (Point-Based):
 * importancePoints = ((importance - min) / range) * BASE_IMPORTANCE_POINTS (0-95)
 * recencyPoints = recencyScore * RECENCY_POINTS (0-5)
 * adjustmentPoints = heatAdjustment (±45)
 * heat = clamp(importancePoints + recencyPoints + adjustmentPoints, 0, 145)
 *
 * V3 Formula (Legacy, 0-1 scale):
 * heat = clamp(
 *   0.50 * (baseImportance / 14) +
 *   heatAdjustment +
 *   0.05 * exp(-daysSinceTouch / 7),
 *   0, 1
 * )
 *
 * See: docs/heat-algorithm-v3.md
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Breakdown of heat components for tooltip display
 * Heat v4: Updated to use point-based system (0-145)
 */
export interface HeatV3Breakdown {
  // Raw component values (normalized 0-1 scores)
  baseImportanceNormalized: number; // 0-1 (normalized from importance scale)
  recencyNormalized: number; // 0-1

  // Point contributions (Heat v4)
  importancePoints: number; // 0-95 points
  recencyPoints: number; // 0-5 points
  adjustmentPoints: number; // ±45 points

  // Heat adjustment (internal 0-1 scale, still used for decay)
  heatAdjustment: number; // -45 to +45 (points)

  // Legacy weighted contributions (deprecated)
  baseImportanceWeighted: number; // baseImportance * WEIGHT_BASE
  recencyWeighted: number; // recency * WEIGHT_RECENCY

  // Final score (Heat v4: 0-145 points)
  totalHeat: number; // 0-145 points

  // Metadata for tooltips
  daysSinceLastTouch: number;
  decayInfo?: {
    originalAdjustment: number; // Before decay (0-1 scale)
    decayedAdjustment: number; // After decay (0-1 scale)
    daysSinceHeatTouch: number;
  };
}

/**
 * Heat stage for visual display
 */
export type HeatStage = "hot" | "warm" | "cooling" | "cool" | "cold" | "freezing";

/**
 * Result of asymmetric decay calculation
 */
export interface DecayResult {
  decayFactor: number;
  newAdjustment: number;
}

/**
 * Glow level for heat/cool button display
 */
export type GlowLevel = 0 | 1 | 2 | 3;

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
 * Clamp a heat adjustment value to the configured bounds
 */
export function clampHeatAdjustment(adjustment: number): number {
  return clamp(adjustment, HEAT_CONFIG.MIN_HEAT_ADJUSTMENT, HEAT_CONFIG.MAX_HEAT_ADJUSTMENT);
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
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
}

// ============================================================================
// Component Calculations
// ============================================================================

/**
 * 1. Base Importance (normalized 0-1 scale)
 * Heat v4: Uses dynamic min/max from importance-v1.ts
 * Maps importance (min-max range) → 0.0-1.0 linearly
 *
 * @param importanceV1 - Raw importance score from importance-v1.ts
 * @returns Normalized importance (0-1)
 */
function calculateBaseImportanceNormalized(importanceV1: number): number {
  const min = getMinImportance();
  const range = getImportanceRange();

  // Normalize: (value - min) / range
  return clamp((importanceV1 - min) / range, 0, 1);
}

/**
 * 1b. Base Importance Points (Heat v4)
 * Maps normalized importance to point scale (0-95)
 *
 * @param importanceV1 - Raw importance score from importance-v1.ts
 * @returns Importance points (0-95)
 */
function calculateBaseImportancePoints(importanceV1: number): number {
  const normalized = calculateBaseImportanceNormalized(importanceV1);
  return normalized * HEAT_CONFIG.BASE_IMPORTANCE_POINTS;
}

/**
 * 2. Recency Score (5% weight)
 * Exponential decay based on time since ANY touch
 * Formula: exp(-daysSinceTouch / 7)
 * 7-day half-life
 */
function calculateRecency(
  lastTouchedAt: Date | null,
  now: Date = new Date()
): number {
  if (!lastTouchedAt) {
    return 0; // Never touched
  }

  const daysSinceTouch = daysBetween(lastTouchedAt, now);
  return Math.exp(-daysSinceTouch / 7);
}

// ============================================================================
// Main Heat Calculation
// ============================================================================

/**
 * Calculate heat score for a task
 * Heat v4: Returns a value between 0 and 145 (point-based)
 *
 * @param task - Task with importance, adjustment, and timestamps
 * @param now - Current timestamp for calculations
 * @returns Heat score (0-145 points)
 */
export function calculateHeat(
  task: Pick<
    Task,
    | "importanceV1"
    | "heatAdjustment"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
  >,
  now: Date = new Date()
): number {
  // Convert dates
  const lastTouchedDate = toDate(task.lastTouchedAt);
  const lastHeatTouchedDate = toDate(task.lastHeatTouchedAt);

  // Calculate each component in points
  const importancePoints = calculateBaseImportancePoints(task.importanceV1);
  const recencyNormalized = calculateRecency(lastTouchedDate, now);
  const recencyPoints = recencyNormalized * HEAT_CONFIG.RECENCY_POINTS;

  // Apply asymmetric decay to heat adjustment
  const { newAdjustment } = applyAsymmetricDecay(
    task.heatAdjustment,
    lastHeatTouchedDate,
    now
  );

  // Adjustment already expressed in points
  const adjustmentPoints = clampHeatAdjustment(newAdjustment);

  // Calculate total heat in points
  const heat = importancePoints + recencyPoints + adjustmentPoints;

  return clamp(heat, HEAT_CONFIG.MIN_FINAL_SCORE, HEAT_CONFIG.MAX_FINAL_SCORE);
}

/**
 * Calculate heat score with detailed breakdown for tooltip display
 * Heat v4: Returns point-based breakdown (0-145 scale)
 */
export function calculateHeatWithBreakdown(
  task: Pick<
    Task,
    | "importanceV1"
    | "heatAdjustment"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
  >,
  now: Date = new Date()
): HeatV3Breakdown {
  // Convert dates
  const lastTouchedDate = toDate(task.lastTouchedAt);
  const lastHeatTouchedDate = toDate(task.lastHeatTouchedAt);

  // Calculate each component (normalized 0-1)
  const baseImportanceNormalized = calculateBaseImportanceNormalized(task.importanceV1);
  const recencyNormalized = calculateRecency(lastTouchedDate, now);

  // Calculate points (Heat v4)
  const importancePoints = baseImportanceNormalized * HEAT_CONFIG.BASE_IMPORTANCE_POINTS;
  const recencyPoints = recencyNormalized * HEAT_CONFIG.RECENCY_POINTS;

  // Apply asymmetric decay to heat adjustment
  const { newAdjustment, decayFactor } = applyAsymmetricDecay(
    task.heatAdjustment,
    lastHeatTouchedDate,
    now
  );

  // Adjustment already expressed in points
  const adjustmentPoints = clampHeatAdjustment(newAdjustment);

  // Calculate legacy weighted contributions (for backwards compatibility)
  const baseImportanceWeighted = HEAT_CONFIG.WEIGHT_BASE * baseImportanceNormalized;
  const recencyWeighted = HEAT_CONFIG.WEIGHT_RECENCY * recencyNormalized;

  // Calculate total heat (using the main function to ensure consistency)
  const totalHeat = calculateHeat(task, now);

  // Calculate metadata
  const daysSinceLastTouch = lastTouchedDate ? daysBetween(lastTouchedDate, now) : 0;
  const daysSinceHeatTouch = lastHeatTouchedDate ? daysBetween(lastHeatTouchedDate, now) : 0;

  // Build decay info if there's a meaningful decay
  const decayInfo = (task.heatAdjustment !== 0 && lastHeatTouchedDate && decayFactor < 0.999) ? {
    originalAdjustment: task.heatAdjustment,
    decayedAdjustment: adjustmentPoints,
    daysSinceHeatTouch,
  } : undefined;

  return {
    baseImportanceNormalized,
    recencyNormalized,
    importancePoints,
    recencyPoints,
    adjustmentPoints,
    heatAdjustment: adjustmentPoints, // Decayed adjustment (points)
    baseImportanceWeighted,
    recencyWeighted,
    totalHeat, // 0-145 points
    daysSinceLastTouch,
    decayInfo,
  };
}

// ============================================================================
// Asymmetric Decay
// ============================================================================

/**
 * Apply asymmetric decay to heat adjustment (points)
 *
 * Key insight: Heat and cool have different semantics:
 * - Heat = "This is important to me" → Slow decay (7-day half-life)
 * - Cool = "Not right now, ask me again soon" → Fast decay (3-day half-life)
 *
 * Formula:
 * - If adjustment > 0: decay with 7-day half-life
 * - If adjustment < 0: decay with 3-day half-life (2x faster)
 *
 * @param currentAdjustment - Current heat adjustment value
 * @param lastHeatTouchedAt - Timestamp of last heat/cool action
 * @param now - Current timestamp
 * @returns DecayResult with decay factor and new adjustment
 */
export function applyAsymmetricDecay(
  currentAdjustment: number,
  lastHeatTouchedAt: Date | null,
  now: Date = new Date()
): DecayResult {
  if (currentAdjustment === 0 || !lastHeatTouchedAt) {
    return {
      decayFactor: 1,
      newAdjustment: currentAdjustment,
    };
  }

  const lastTouchDate = toDate(lastHeatTouchedAt);
  if (!lastTouchDate) {
    return {
      decayFactor: 1,
      newAdjustment: currentAdjustment,
    };
  }

  const daysSinceLast = daysBetween(lastTouchDate, now);

  // Asymmetric decay based on sign
  let decayFactor: number;
  if (currentAdjustment > 0) {
    // Heat: 7-day half-life (persistent preference)
    decayFactor = Math.exp(-daysSinceLast * Math.LN2 / HEAT_CONFIG.HEAT_HALF_LIFE_DAYS);
  } else {
    // Cool: 3-day half-life (temporary deferral)
    decayFactor = Math.exp(-daysSinceLast * Math.LN2 / HEAT_CONFIG.COOL_HALF_LIFE_DAYS);
  }

  // Apply decay
  const newAdjustment = currentAdjustment * decayFactor;

  return {
    decayFactor,
    newAdjustment: clampHeatAdjustment(newAdjustment),
  };
}

// ============================================================================
// Context-Aware Positioning
// ============================================================================

/**
 * Calculate heat boost to move task up 1 position
 *
 * Goal: Reduce friction - move task above the next highest task with single click
 * Clamped by configuration to avoid runaway adjustments
 *
 * @param currentTask - The task being heated
 * @param visibleTasks - All visible tasks sorted by heat (descending)
 * @returns Heat delta (target heat - current heat)
 */
export function calculateHeatBoost(
  currentTask: { heat: number; id: number },
  visibleTasks?: Array<{ heat: number; id: number }>
): number {
  const tasks = (visibleTasks ?? []).filter(
    (t) => t.id !== currentTask.id && Number.isFinite(t.heat)
  );

  const maxTarget = clamp(
    currentTask.heat + HEAT_CONFIG.MAX_BOOST_PER_CLICK,
    HEAT_CONFIG.MIN_FINAL_SCORE,
    HEAT_CONFIG.MAX_FINAL_SCORE
  );

  const tasksAbove = tasks
    .filter((t) => t.heat > currentTask.heat)
    .sort((a, b) => a.heat - b.heat); // nearest higher heat first

  const contextTarget =
    tasksAbove.length > 0
      ? clamp(
          tasksAbove[0].heat + 1,
          HEAT_CONFIG.MIN_FINAL_SCORE,
          HEAT_CONFIG.MAX_FINAL_SCORE
        )
      : maxTarget;

  const targetHeat = Math.min(maxTarget, contextTarget);

  return targetHeat - currentTask.heat;
}

/**
 * Calculate cool drop to move task down 3 positions
 *
 * Goal: Decisive cooling - skip 2 tasks to prevent ping-pong cycling
 * Clamped by configuration to avoid runaway adjustments
 *
 * @param currentTask - The task being cooled
 * @param visibleTasks - All visible tasks sorted by heat (descending)
 * @returns Heat delta (negative, target heat - current heat)
 */
export function calculateCoolDrop(
  currentTask: { heat: number; id: number },
  visibleTasks?: Array<{ heat: number; id: number }>
): number {
  const tasks = (visibleTasks ?? []).filter(
    (t) => t.id !== currentTask.id && Number.isFinite(t.heat)
  );

  const minTarget = clamp(
    currentTask.heat - HEAT_CONFIG.MAX_DROP_PER_CLICK,
    HEAT_CONFIG.MIN_FINAL_SCORE,
    HEAT_CONFIG.MAX_FINAL_SCORE
  );

  const tasksBelow = tasks
    .filter((t) => t.heat < currentTask.heat)
    .sort((a, b) => b.heat - a.heat); // nearest lower heat first

  const targetIndex = Math.min(
    HEAT_CONFIG.COOL_SKIP_POSITIONS - 1,
    Math.max(tasksBelow.length - 1, 0)
  );

  const contextTarget =
    tasksBelow.length > 0
      ? clamp(
          tasksBelow[targetIndex].heat - 1,
          HEAT_CONFIG.MIN_FINAL_SCORE,
          HEAT_CONFIG.MAX_FINAL_SCORE
        )
      : minTarget;

  const targetHeat = Math.max(minTarget, contextTarget);

  return targetHeat - currentTask.heat;
}

/**
 * Calculate heat adjustment for drag & drop positioning
 * Heat v4: Works with point-based target heat (0-145)
 *
 * @param draggedTask - The task being dragged
 * @param targetHeat - Target heat value in points (0-145, midpoint between neighbors)
 * @param now - Current timestamp
 * @returns New heat adjustment value (points, stored directly on the task)
 */
export function calculateDragAdjustment(
  draggedTask: Pick<Task, "importanceV1" | "lastTouchedAt">,
  targetHeat: number,
  now: Date = new Date()
): number {
  // Calculate base components in points
  const importancePoints = calculateBaseImportancePoints(draggedTask.importanceV1);
  const recencyNormalized = calculateRecency(toDate(draggedTask.lastTouchedAt), now);
  const recencyPoints = recencyNormalized * HEAT_CONFIG.RECENCY_POINTS;

  // Calculate required adjustment in points
  const requiredAdjustmentPoints = targetHeat - importancePoints - recencyPoints;

  // Adjustment stored directly in points
  return clampHeatAdjustment(requiredAdjustmentPoints);
}

/**
 * Given a target heat score, resolve the adjustment needed after applying decay
 * Returns new adjustment, baseline heat before change, and adjustment delta
 */
export function resolveAdjustmentForTargetHeat(
  targetHeat: number,
  task: Pick<
    Task,
    | "importanceV1"
    | "heatAdjustment"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
  >,
  now: Date = new Date()
): {
  newAdjustment: number;
  baselineHeat: number;
  adjustmentDelta: number;
  basePoints: number;
} {
  const baselineBreakdown = calculateHeatWithBreakdown(
    {
      importanceV1: task.importanceV1,
      heatAdjustment: task.heatAdjustment,
      lastTouchedAt: now,
      lastHeatTouchedAt: now,
    },
    now
  );

  const basePoints =
    baselineBreakdown.importancePoints + baselineBreakdown.recencyPoints;
  const baselineHeat = baselineBreakdown.totalHeat;

  const unclampedAdjustment = targetHeat - basePoints;
  const newAdjustment = clampHeatAdjustment(unclampedAdjustment);
  const adjustmentDelta = newAdjustment - task.heatAdjustment;

  return {
    newAdjustment,
    baselineHeat,
    adjustmentDelta,
    basePoints,
  };
}

// ============================================================================
// Display Utilities
// ============================================================================

/**
 * Get heat stage for visual display
 * Heat v4: Maps 0-145 point range to descriptive stages
 * Thresholds proportionally scaled from 0-1 to 0-145
 */
export function getHeatStage(heat: number): HeatStage {
  // V4 thresholds (0-145 scale): maintain same proportions as V3
  if (heat >= 102) return "hot"; // 102-145 (70-100%): Red
  if (heat >= 73) return "warm"; // 73-102 (50-70%): Orange
  if (heat >= 44) return "cooling"; // 44-73 (30-50%): Yellow
  if (heat >= 22) return "cool"; // 22-44 (15-30%): Blue
  if (heat >= 7) return "cold"; // 7-22 (5-15%): Light Blue
  return "freezing"; // <7 (<5%): Gray
}

/**
 * Get color class based on heat score
 * Heat v4: Uses centralized color configuration from importance-colors.ts
 * Delegates to shared configuration for adaptability
 *
 * @param heat - Heat score (0-145 points)
 * @returns Tailwind color class
 */
export function getHeatColor(heat: number): string {
  return getHeatColorFromConfig(heat);
}

/**
 * Get label for heat score
 * Heat v4: Uses centralized color configuration from importance-colors.ts
 * Delegates to shared configuration for adaptability
 *
 * @param heat - Heat score (0-145 points)
 * @returns Label string
 */
export function getHeatLabel(heat: number): string {
  return getHeatLabelFromConfig(heat);
}

/**
 * Get glow level for heat/cool button display
 * Based on absolute value of adjustment
 */
export function getGlowLevel(adjustment: number): GlowLevel {
  const abs = Math.abs(adjustment);
  if (abs >= GLOW_CONFIG.THRESHOLDS.STRONG) return 3; // Strong glow + pulse
  if (abs >= GLOW_CONFIG.THRESHOLDS.MEDIUM) return 2; // Medium glow
  if (abs >= GLOW_CONFIG.THRESHOLDS.LIGHT) return 1;  // Light glow
  return 0; // No glow
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

  const hoursSinceCalc = daysBetween(calculatedDate, now) * 24;
  return hoursSinceCalc >= HEAT_CONFIG.HEAT_STALENESS_HOURS;
}
