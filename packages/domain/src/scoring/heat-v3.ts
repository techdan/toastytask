/**
 * Current Heat Algorithm - Simplified 3-Component Model with Point-Based Normalization
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
 * - Asymmetric decay: Cool decays 2x faster (3-day vs 7-day half-life)
 * - Enhanced star: 3 levels (blue/yellow/orange) = +1/+2/+3 to base importance
 */

import { HEAT_CONFIG, GLOW_CONFIG } from "./heat-config";
import { getMinImportance, getImportanceRange } from "./importance-v1";
import { getHeatColorFromConfig, getHeatLabelFromConfig } from "./importance-colors";
import { toDate, daysBetween, clamp } from "../utils/date";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Breakdown of heat components for tooltip display
 */
export interface HeatV3Breakdown {
  baseImportanceNormalized: number;
  recencyNormalized: number;
  importancePointsUnrounded: number;
  recencyPointsUnrounded: number;
  adjustmentPointsUnrounded: number;
  importancePoints: number;
  recencyPoints: number;
  adjustmentPoints: number;
  heatAdjustment: number;
  decayFactor: number;
  decayedAdjustmentUnrounded: number;
  decayedAdjustmentRounded: number;
  baseImportanceWeighted: number;
  recencyWeighted: number;
  totalHeat: number;
  daysSinceLastTouch: number;
  daysSinceHeatTouch: number;
  decayInfo?: {
    originalAdjustment: number;
    decayedAdjustment: number;
    daysSinceHeatTouch: number;
  };
  isFocused: boolean;
  isFocusSnoozed: boolean;
  focusBoostApplied: boolean;
  preBoostHeat: number;
  focusBoostAmount: number;
}

export type HeatStage = "hot" | "warm" | "cooling" | "cool" | "cold" | "freezing";

export interface DecayResult {
  decayFactor: number;
  newAdjustment: number;
}

export type GlowLevel = 0 | 1 | 2 | 3;

/**
 * Task fields required for heat calculation
 */
export interface HeatTask {
  heatAdjustment: number;
  lastTouchedAt?: Date | number | string | null;
  lastHeatTouchedAt?: Date | number | string | null;
  importanceV1?: number | null;
  isFocused?: boolean | null;
  focusSnoozeUntil?: Date | number | string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function isFocusSnoozed(
  focusSnoozeUntil: Date | number | string | null | undefined,
  now: Date
): boolean {
  if (!focusSnoozeUntil) return false;
  const snoozeDate = toDate(focusSnoozeUntil);
  if (!snoozeDate) return false;
  return now < snoozeDate;
}

export function clampHeatAdjustment(adjustment: number): number {
  return clamp(
    adjustment,
    HEAT_CONFIG.MIN_HEAT_ADJUSTMENT,
    HEAT_CONFIG.MAX_HEAT_ADJUSTMENT
  );
}

// ============================================================================
// Component Calculations
// ============================================================================

function calculateBaseImportanceNormalized(importanceV1: number): number {
  const min = getMinImportance();
  const range = getImportanceRange();
  return clamp((importanceV1 - min) / range, 0, 1);
}

function calculateBaseImportancePoints(importanceV1: number): number {
  const normalized = calculateBaseImportanceNormalized(importanceV1);
  return normalized * HEAT_CONFIG.BASE_IMPORTANCE_POINTS;
}

function calculateRecency(
  lastTouchedAt: Date | null,
  now: Date = new Date()
): number {
  if (!lastTouchedAt) {
    return 0;
  }
  const daysSinceTouch = daysBetween(lastTouchedAt, now);
  return Math.exp(-daysSinceTouch / 7);
}

// ============================================================================
// Main Heat Calculation
// ============================================================================

/**
 * Calculate heat score for a task
 * Returns a value between 0 and 145 (point-based)
 */
export function calculateHeat(
  task: HeatTask,
  now: Date = new Date(),
  importance?: number
): number {
  const heatAdjustment = Number.isFinite(task.heatAdjustment)
    ? task.heatAdjustment
    : 0;

  const lastTouchedDate = toDate(task.lastTouchedAt);
  const lastHeatTouchedDate = toDate(task.lastHeatTouchedAt);
  const importanceValue = importance ?? task.importanceV1 ?? 0;

  // Component 1: Importance points (ROUNDED)
  const importancePointsRaw = calculateBaseImportancePoints(importanceValue);
  const importancePoints = Math.round(importancePointsRaw);

  // Component 2: Recency points (ROUNDED)
  const recencyNormalized = calculateRecency(lastTouchedDate, now);
  const recencyPointsRaw = recencyNormalized * HEAT_CONFIG.RECENCY_POINTS;
  const recencyPoints = Math.round(recencyPointsRaw);

  // Component 3: Adjustment with decay (ROUNDED)
  const { newAdjustment } = applyAsymmetricDecay(
    heatAdjustment,
    lastHeatTouchedDate,
    now
  );
  const adjustmentPoints = Math.round(clampHeatAdjustment(newAdjustment));

  // Calculate total heat
  let finalHeat = importancePoints + recencyPoints + adjustmentPoints;

  // Apply focus boost if active and not snoozed
  if (task.isFocused && !isFocusSnoozed(task.focusSnoozeUntil, now)) {
    const effectiveScore = Math.max(finalHeat, HEAT_CONFIG.FOCUS_FLOOR);
    finalHeat = effectiveScore * HEAT_CONFIG.FOCUS_MULTIPLIER;
  }

  return clamp(finalHeat, HEAT_CONFIG.MIN_FINAL_SCORE, HEAT_CONFIG.MAX_FINAL_SCORE);
}

/**
 * Calculate heat score with detailed breakdown for tooltip display
 */
export function calculateHeatWithBreakdown(
  task: HeatTask,
  now: Date = new Date(),
  importance?: number
): HeatV3Breakdown {
  const lastTouchedDate = toDate(task.lastTouchedAt);
  const lastHeatTouchedDate = toDate(task.lastHeatTouchedAt);
  const importanceValue = importance ?? task.importanceV1 ?? 0;

  const baseImportanceNormalized = calculateBaseImportanceNormalized(importanceValue);
  const recencyNormalized = calculateRecency(lastTouchedDate, now);

  const importancePointsUnrounded =
    baseImportanceNormalized * HEAT_CONFIG.BASE_IMPORTANCE_POINTS;
  const recencyPointsUnrounded =
    recencyNormalized * HEAT_CONFIG.RECENCY_POINTS;

  const importancePoints = Math.round(importancePointsUnrounded);
  const recencyPoints = Math.round(recencyPointsUnrounded);

  const { newAdjustment, decayFactor } = applyAsymmetricDecay(
    Number.isFinite(task.heatAdjustment) ? task.heatAdjustment : 0,
    lastHeatTouchedDate,
    now
  );

  const originalAdjustment = task.heatAdjustment ?? 0;
  const decayedAdjustmentUnrounded = clampHeatAdjustment(newAdjustment);
  const decayedAdjustmentRounded = Math.round(decayedAdjustmentUnrounded);
  const adjustmentPointsUnrounded = decayedAdjustmentUnrounded;
  const adjustmentPoints = decayedAdjustmentRounded;

  const baseImportanceWeighted =
    HEAT_CONFIG.WEIGHT_BASE * baseImportanceNormalized;
  const recencyWeighted = HEAT_CONFIG.WEIGHT_RECENCY * recencyNormalized;

  const preBoostHeat = importancePoints + recencyPoints + adjustmentPoints;

  let focusBoostAmount = 0;
  const focusSnoozed = isFocusSnoozed(task.focusSnoozeUntil, now);
  const focusBoostApplied = (task.isFocused ?? false) && !focusSnoozed;

  if (focusBoostApplied) {
    const effectiveScore = Math.max(preBoostHeat, HEAT_CONFIG.FOCUS_FLOOR);
    const boostedHeat = effectiveScore * HEAT_CONFIG.FOCUS_MULTIPLIER;
    focusBoostAmount = boostedHeat - preBoostHeat;
  }

  const totalHeat = calculateHeat(task, now, importanceValue);

  const daysSinceLastTouch = lastTouchedDate
    ? daysBetween(lastTouchedDate, now)
    : 0;
  const daysSinceHeatTouch = lastHeatTouchedDate
    ? daysBetween(lastHeatTouchedDate, now)
    : 0;

  const decayInfo =
    originalAdjustment !== 0 && lastHeatTouchedDate && decayFactor < 0.999
      ? {
          originalAdjustment,
          decayedAdjustment: adjustmentPoints,
          daysSinceHeatTouch,
        }
      : undefined;

  return {
    baseImportanceNormalized,
    recencyNormalized,
    importancePointsUnrounded,
    recencyPointsUnrounded,
    adjustmentPointsUnrounded,
    importancePoints,
    recencyPoints,
    adjustmentPoints,
    heatAdjustment: originalAdjustment,
    decayFactor,
    decayedAdjustmentUnrounded,
    decayedAdjustmentRounded,
    baseImportanceWeighted,
    recencyWeighted,
    totalHeat,
    daysSinceLastTouch,
    daysSinceHeatTouch,
    decayInfo,
    isFocused: task.isFocused ?? false,
    isFocusSnoozed: focusSnoozed,
    focusBoostApplied,
    preBoostHeat,
    focusBoostAmount,
  };
}

// ============================================================================
// Asymmetric Decay
// ============================================================================

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

  let decayFactor: number;
  if (safeAdjustment > 0) {
    decayFactor = Math.exp(
      (-daysSinceLast * Math.LN2) / HEAT_CONFIG.HEAT_HALF_LIFE_DAYS
    );
  } else {
    decayFactor = Math.exp(
      (-daysSinceLast * Math.LN2) / HEAT_CONFIG.COOL_HALF_LIFE_DAYS
    );
  }

  const newAdjustment = safeAdjustment * decayFactor;

  return {
    decayFactor,
    newAdjustment: clampHeatAdjustment(newAdjustment),
  };
}

// ============================================================================
// Context-Aware Positioning
// ============================================================================

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
    .sort((a, b) => a.heat - b.heat);

  let contextTarget: number;
  if (tasksAbove.length > 0) {
    contextTarget = clamp(
      tasksAbove[0].heat + 1,
      HEAT_CONFIG.MIN_FINAL_SCORE,
      HEAT_CONFIG.MAX_FINAL_SCORE
    );
  } else {
    contextTarget = maxTarget;
  }

  const targetHeat = Math.min(maxTarget, contextTarget);
  return targetHeat - currentTask.heat;
}

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

  const tasksBelowOrEqual = tasks
    .filter((t) => t.heat <= currentTask.heat)
    .sort((a, b) => b.heat - a.heat);

  const tasksInRange = tasksBelowOrEqual.filter((t) => t.heat >= minTarget);

  let contextTarget: number;
  if (tasksInRange.length > 0) {
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
    contextTarget = minTarget;
  }

  const targetHeat = tasksInRange.length > 0 ? contextTarget : minTarget;
  return targetHeat - currentTask.heat;
}

// ============================================================================
// Display Utilities
// ============================================================================

export function getHeatStage(heat: number): HeatStage {
  if (heat >= 102) return "hot";
  if (heat >= 73) return "warm";
  if (heat >= 44) return "cooling";
  if (heat >= 22) return "cool";
  if (heat >= 7) return "cold";
  return "freezing";
}

export function getHeatColor(heat: number): string {
  return getHeatColorFromConfig(heat);
}

export function getHeatLabel(heat: number): string {
  return getHeatLabelFromConfig(heat);
}

export function getGlowLevel(adjustment: number): GlowLevel {
  const abs = Math.abs(adjustment);
  if (abs >= GLOW_CONFIG.THRESHOLDS.STRONG) return 3;
  if (abs >= GLOW_CONFIG.THRESHOLDS.MEDIUM) return 2;
  if (abs >= GLOW_CONFIG.THRESHOLDS.LIGHT) return 1;
  return 0;
}

export function isHeatStale(
  heatCalculatedAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!heatCalculatedAt) {
    return true;
  }

  const calculatedDate = toDate(heatCalculatedAt);
  if (!calculatedDate) {
    return true;
  }

  const hoursSinceCalc = daysBetween(calculatedDate, now) * 24;
  return hoursSinceCalc >= HEAT_CONFIG.HEAT_STALENESS_HOURS;
}
