import type { Task } from "@/types";
import { HEAT_CONFIG, GLOW_CONFIG } from "./heat-config";
import { getMinImportance, getImportanceRange } from "./importance-v1";
import { getHeatColorFromConfig, getHeatLabelFromConfig } from "./importance-colors";

/**
 * Current Heat Algorithm - Simplified 3-Component Model with Point-Based Normalization
 *
 * ⚠️ SINGLE SOURCE OF TRUTH ⚠️
 * This is the ONLY place where the current heat calculation logic should exist.
 *
 * Current Formula (Point-Based, 0-145 scale):
 * importancePoints = ((importance - min) / range) * BASE_IMPORTANCE_POINTS (0-95)
 * recencyPoints = recencyScore * RECENCY_POINTS (0-5)
 * adjustmentPoints = heatAdjustment (±45)
 * heat = clamp(importancePoints + recencyPoints + adjustmentPoints, 0, 145)
 *
 * Key Features:
 * - 3 components: base importance (95 pts), heat adjustment (±45 pts), recency (5 pts)
 * - Direct heat tracking: heatAdjustment (-45 to +45) tracked in points
 * - Context-aware positioning: Heat moves up 1, Cool moves down 3 positions
 * - Asymmetric decay: Cool decays 2x faster (3-day vs 7-day half-life)
 * - Enhanced star: 3 levels (blue/yellow/orange) = +1/+2/+3 to base importance
 * - Hybrid pattern: Heat is cached in DB for sorting, recalculated fresh on client for display
 * - No time skew: Server calculates fresh heat from task IDs, not client-sent values
 *
 * ARCHITECTURE: Hybrid Calculate-and-Cache Pattern
 * - Server: Calculates and caches heat in database for efficient ORDER BY operations
 * - Client: Recalculates fresh values on every render for accurate display
 * - See: docs/current-heat-algorithm.md for detailed architecture explanation
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Breakdown of heat components for tooltip display
 * Uses point-based system (0-145)
 */
export interface HeatV3Breakdown {
  // Raw component values (normalized 0-1 scores)
  baseImportanceNormalized: number; // 0-1 (normalized from importance scale)
  recencyNormalized: number; // 0-1

  // Point contributions (Heat v4) - UNROUNDED for transparency
  importancePointsUnrounded: number; // 0-95 points (before rounding)
  recencyPointsUnrounded: number; // 0-5 points (before rounding)
  adjustmentPointsUnrounded: number; // ±45 points (before rounding)

  // Point contributions (Heat v4) - ROUNDED (used in final calculation)
  importancePoints: number; // 0-95 points (rounded)
  recencyPoints: number; // 0-5 points (rounded)
  adjustmentPoints: number; // ±45 points (rounded)

  // Heat adjustment tracking (separate adjustment from decay)
  heatAdjustment: number; // Original adjustment value (integer, stored in DB)
  decayFactor: number; // Decay multiplier (0-1)
  decayedAdjustmentUnrounded: number; // adjustment * decayFactor (unrounded)
  decayedAdjustmentRounded: number; // adjustment * decayFactor (rounded)

  // Legacy weighted contributions (deprecated)
  baseImportanceWeighted: number; // baseImportance * WEIGHT_BASE
  recencyWeighted: number; // recency * WEIGHT_RECENCY

  // Final score (Heat v4: 0-145 points)
  totalHeat: number; // 0-145 points (sum of rounded components)

  // Metadata for tooltips
  daysSinceLastTouch: number;
  daysSinceHeatTouch: number;
  decayInfo?: {
    originalAdjustment: number; // Before decay
    decayedAdjustment: number; // After decay
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
 * HYBRID PATTERN - When/Where This Function Is Called:
 *
 * SERVER SIDE:
 * - During mutations (task updates, heat/cool actions, etc.)
 * - Result is written to database via taskRepository.updateHeat()
 * - Cached value enables efficient database-level sorting (ORDER BY heat)
 *
 * CLIENT SIDE:
 * - On every render to calculate _freshHeat for display
 * - Used for accurate tooltips, badges, and client-side sorting
 * - Ensures timezone accuracy and current time-based calculations
 * - Type: TaskWithFreshValues includes _freshHeat and _freshImportance
 *
 * Data Flow:
 * 1. Server: calculateHeat() → updateHeat() → Database (cached for ORDER BY)
 * 2. Client: Fetch tasks → calculateHeat() → _freshHeat (for display)
 * 3. Result: Fast initial load (DB sorted) + Accurate display (fresh calculation)
 *
 * IMPORTANT: Heat values are always integers. Each component is rounded
 * to prevent fractional accumulation, especially from exponential decay.
 *
 * @param task - Task with importance, adjustment, and timestamps
 * @param now - Current timestamp for calculations
 * @param importance - Optional pre-calculated importance (if not provided, uses task.importanceV1)
 * @returns Heat score (0-145 points, integer)
 */
export function calculateHeat(
  task: Pick<
    Task,
    | "heatAdjustment"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
  > & Partial<Pick<Task, "importanceV1">>,
  now: Date = new Date(),
  importance?: number
): number {
  const heatAdjustment = Number.isFinite(task.heatAdjustment)
    ? task.heatAdjustment
    : 0;

  // Convert dates
  const lastTouchedDate = toDate(task.lastTouchedAt);
  const lastHeatTouchedDate = toDate(task.lastHeatTouchedAt);

  // Get importance value (use parameter if provided, otherwise fall back to task field)
  const importanceValue = importance ?? task.importanceV1 ?? 0;

  // Component 1: Importance points (ROUNDED)
  const importancePointsRaw = calculateBaseImportancePoints(importanceValue);
  const importancePoints = Math.round(importancePointsRaw);

  // Component 2: Recency points (ROUNDED)
  const recencyNormalized = calculateRecency(lastTouchedDate, now);
  const recencyPointsRaw = recencyNormalized * HEAT_CONFIG.RECENCY_POINTS;
  const recencyPoints = Math.round(recencyPointsRaw);

  // Component 3: Adjustment with decay (ROUNDED)
  // Apply asymmetric decay to heat adjustment
  const { newAdjustment } = applyAsymmetricDecay(
    heatAdjustment,
    lastHeatTouchedDate,
    now
  );

  // Round the decayed adjustment to prevent fractional drift
  const adjustmentPoints = Math.round(clampHeatAdjustment(newAdjustment));

  // Calculate total heat (sum of rounded components = integer)
  const heat = importancePoints + recencyPoints + adjustmentPoints;

  return clamp(heat, HEAT_CONFIG.MIN_FINAL_SCORE, HEAT_CONFIG.MAX_FINAL_SCORE);
}

/**
 * Calculate heat score with detailed breakdown for tooltip display
 * Heat v4: Returns point-based breakdown (0-145 scale)
 *
 * Includes both unrounded and rounded values for transparency and debugging
 *
 * @param task - Task with importance, adjustment, and timestamps
 * @param now - Current timestamp for calculations
 * @param importance - Optional pre-calculated importance (if not provided, uses task.importanceV1)
 */
export function calculateHeatWithBreakdown(
  task: Pick<
    Task,
    | "heatAdjustment"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
  > & Partial<Pick<Task, "importanceV1">>,
  now: Date = new Date(),
  importance?: number
): HeatV3Breakdown {
  // Convert dates
  const lastTouchedDate = toDate(task.lastTouchedAt);
  const lastHeatTouchedDate = toDate(task.lastHeatTouchedAt);

  // Get importance value (use parameter if provided, otherwise fall back to task field)
  const importanceValue = importance ?? task.importanceV1 ?? 0;

  // Calculate each component (normalized 0-1)
  const baseImportanceNormalized = calculateBaseImportanceNormalized(importanceValue);
  const recencyNormalized = calculateRecency(lastTouchedDate, now);

  // Calculate points (Heat v4) - UNROUNDED
  const importancePointsUnrounded = baseImportanceNormalized * HEAT_CONFIG.BASE_IMPORTANCE_POINTS;
  const recencyPointsUnrounded = recencyNormalized * HEAT_CONFIG.RECENCY_POINTS;

  // Calculate points (Heat v4) - ROUNDED (matches calculateHeat)
  const importancePoints = Math.round(importancePointsUnrounded);
  const recencyPoints = Math.round(recencyPointsUnrounded);

  // Apply asymmetric decay to heat adjustment
  const { newAdjustment, decayFactor } = applyAsymmetricDecay(
    Number.isFinite(task.heatAdjustment) ? task.heatAdjustment : 0,
    lastHeatTouchedDate,
    now
  );

  // Separate adjustment from decay for transparency
  const originalAdjustment = task.heatAdjustment ?? 0; // Integer stored in DB
  const decayedAdjustmentUnrounded = clampHeatAdjustment(newAdjustment);
  const decayedAdjustmentRounded = Math.round(decayedAdjustmentUnrounded);
  const adjustmentPointsUnrounded = decayedAdjustmentUnrounded;
  const adjustmentPoints = decayedAdjustmentRounded;

  // Calculate legacy weighted contributions (for backwards compatibility)
  const baseImportanceWeighted = HEAT_CONFIG.WEIGHT_BASE * baseImportanceNormalized;
  const recencyWeighted = HEAT_CONFIG.WEIGHT_RECENCY * recencyNormalized;

  // Calculate total heat (using the main function to ensure consistency)
  const totalHeat = calculateHeat(task, now, importanceValue);

  // Calculate metadata
  const daysSinceLastTouch = lastTouchedDate ? daysBetween(lastTouchedDate, now) : 0;
  const daysSinceHeatTouch = lastHeatTouchedDate ? daysBetween(lastHeatTouchedDate, now) : 0;

  // Build decay info if there's a meaningful decay
  const decayInfo = (originalAdjustment !== 0 && lastHeatTouchedDate && decayFactor < 0.999) ? {
    originalAdjustment,
    decayedAdjustment: adjustmentPoints,
    daysSinceHeatTouch,
  } : undefined;

  return {
    baseImportanceNormalized,
    recencyNormalized,
    importancePointsUnrounded,
    recencyPointsUnrounded,
    adjustmentPointsUnrounded,
    importancePoints,
    recencyPoints,
    adjustmentPoints,
    heatAdjustment: originalAdjustment, // Original adjustment (integer, from DB)
    decayFactor,
    decayedAdjustmentUnrounded,
    decayedAdjustmentRounded,
    baseImportanceWeighted,
    recencyWeighted,
    totalHeat, // 0-145 points (sum of rounded components)
    daysSinceLastTouch,
    daysSinceHeatTouch,
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
  const safeAdjustment = Number.isFinite(currentAdjustment)
    ? currentAdjustment
    : 0;

  if (safeAdjustment === 0 || !lastHeatTouchedAt) {
    return {
      decayFactor: 1,
      newAdjustment: safeAdjustment,
    };
  }

  const lastTouchDate = toDate(lastHeatTouchedAt);
  if (!lastTouchDate) {
    return {
      decayFactor: 1,
      newAdjustment: safeAdjustment,
    };
  }

  const daysSinceLast = daysBetween(lastTouchDate, now);

  // Asymmetric decay based on sign
  let decayFactor: number;
  if (safeAdjustment > 0) {
    // Heat: 7-day half-life (persistent preference)
    decayFactor = Math.exp(-daysSinceLast * Math.LN2 / HEAT_CONFIG.HEAT_HALF_LIFE_DAYS);
  } else {
    // Cool: 3-day half-life (temporary deferral)
    decayFactor = Math.exp(-daysSinceLast * Math.LN2 / HEAT_CONFIG.COOL_HALF_LIFE_DAYS);
  }

  // Apply decay
  const newAdjustment = safeAdjustment * decayFactor;

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

  // Include tasks ABOVE current heat level (skip tasks at same level)
  const tasksAbove = tasks
    .filter((t) => t.heat > currentTask.heat)
    .sort((a, b) => a.heat - b.heat); // nearest first

  let contextTarget: number;
  if (tasksAbove.length > 0) {
    // Found tasks above - move just above the nearest one
    contextTarget = clamp(
      tasksAbove[0].heat + 1,
      HEAT_CONFIG.MIN_FINAL_SCORE,
      HEAT_CONFIG.MAX_FINAL_SCORE
    );
  } else {
    // No context - use max boost
    contextTarget = maxTarget;
  }

  // Apply cap: move to the LESSER of (context target) or (current + 5)
  const targetHeat = Math.min(maxTarget, contextTarget);
  const boost = targetHeat - currentTask.heat;

  return boost;
}

/**
 * Calculate cool drop to move task down (context-aware)
 *
 * Goal: Move down up to 3 positions, but only within the -10 cap range
 * Prevents hitting the max drop cap when there are closer tasks available
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

  // Include tasks at same heat level (ties) OR below
  const tasksBelowOrEqual = tasks
    .filter((t) => t.heat <= currentTask.heat)
    .sort((a, b) => b.heat - a.heat); // nearest first (highest to lowest)

  // CRITICAL FIX: Only consider tasks within the drop cap range
  // This ensures we don't skip over nearby tasks when trying to move 3 positions
  const tasksInRange = tasksBelowOrEqual.filter((t) => t.heat >= minTarget);

  let contextTarget: number;
  if (tasksInRange.length > 0) {
    // Move down up to 3 positions, but only from tasks within range
    const targetIndex = Math.min(
      HEAT_CONFIG.COOL_SKIP_POSITIONS - 1,
      tasksInRange.length - 1
    );
    contextTarget = clamp(
      tasksInRange[targetIndex].heat - 1,
      HEAT_CONFIG.MIN_FINAL_SCORE,
      HEAT_CONFIG.MAX_FINAL_SCORE
    );
  } else {
    // No tasks in range - use max drop
    contextTarget = minTarget;
  }

  // CRITICAL FIX: Don't apply hard cap when we have valid context
  // The whole point of context-aware positioning is to position relative to nearby tasks,
  // not to enforce arbitrary caps. The cap should only be a fallback when NO context exists.
  // This fixes the bug where dropping 3 positions lands us at heat X, but the cap forces
  // us to a different heat value, defeating context-aware positioning.
  const targetHeat = tasksInRange.length > 0 ? contextTarget : minTarget;
  const drop = targetHeat - currentTask.heat;

  return drop;
}

/**
 * Calculate heat adjustment for drag & drop positioning
 * Heat v4: Works with point-based target heat (0-145)
 *
 * @param draggedTask - The task being dragged
 * @param targetHeat - Target heat value in points (0-145, midpoint between neighbors)
 * @param now - Current timestamp
 * @param importance - Optional pre-calculated importance (if not provided, uses draggedTask.importanceV1)
 * @returns New heat adjustment value (points, stored directly on the task)
 */
export function calculateDragAdjustment(
  draggedTask: Pick<Task, "lastTouchedAt"> & Partial<Pick<Task, "importanceV1">>,
  targetHeat: number,
  now: Date = new Date(),
  importance?: number
): number {
  // Get importance value (use parameter if provided, otherwise fall back to task field)
  const importanceValue = importance ?? draggedTask.importanceV1 ?? 0;

  // Calculate base components in points
  const importancePoints = calculateBaseImportancePoints(importanceValue);
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
 *
 * @param targetHeat - Target heat value
 * @param task - Task with adjustment and timestamps
 * @param now - Current timestamp
 * @param importance - Optional pre-calculated importance (if not provided, uses task.importanceV1)
 */
export function resolveAdjustmentForTargetHeat(
  targetHeat: number,
  task: Pick<
    Task,
    | "heatAdjustment"
    | "lastTouchedAt"
    | "lastHeatTouchedAt"
  > & Partial<Pick<Task, "importanceV1">>,
  now: Date = new Date(),
  importance?: number
): {
  newAdjustment: number;
  baselineHeat: number;
  adjustmentDelta: number;
  basePoints: number;
} {
  // Get importance value (use parameter if provided, otherwise fall back to task field)
  const importanceValue = importance ?? task.importanceV1 ?? 0;

  const baselineBreakdown = calculateHeatWithBreakdown(
    {
      importanceV1: importanceValue,
      heatAdjustment: task.heatAdjustment,
      lastTouchedAt: now,
      lastHeatTouchedAt: now,
    },
    now,
    importanceValue
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
