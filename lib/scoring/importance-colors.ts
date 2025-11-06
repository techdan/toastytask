/**
 * Importance & Heat Color Configuration
 *
 * Heat v4: Centralized color configuration for both importance and heat badges.
 * Heat colors are derived from importance thresholds, ensuring adaptability.
 *
 * This allows both systems to share the same color palette while operating
 * on different scales (importance: 2-14, heat: 0-145).
 */

import { getMinImportance, getImportanceRange } from "./importance-v1";
import { HEAT_CONFIG } from "./heat-config";

/**
 * Color thresholds based on importance score (2-14 scale)
 * These define the master color palette that heat will derive from
 */
export const IMPORTANCE_COLOR_CONFIG = {
  thresholds: [
    { max: 3, color: "bg-blue-400", label: "Low" },           // 2-3
    { max: 5, color: "bg-green-400", label: "Medium-Low" },   // 4-5
    { max: 8, color: "bg-yellow-400", label: "Medium" },      // 6-8
    { max: 11, color: "bg-orange-400", label: "Medium-High" }, // 9-11
    { max: 14, color: "bg-red-400", label: "High" },          // 12-14
  ],
} as const;

/**
 * Get color class for an importance score
 *
 * @param score - Importance score (2-14 scale)
 * @returns Tailwind color class
 */
export function getImportanceColorFromConfig(score: number): string {
  for (const threshold of IMPORTANCE_COLOR_CONFIG.thresholds) {
    if (score <= threshold.max) {
      return threshold.color;
    }
  }
  // Fallback to highest color
  return IMPORTANCE_COLOR_CONFIG.thresholds[IMPORTANCE_COLOR_CONFIG.thresholds.length - 1].color;
}

/**
 * Get label for an importance score
 *
 * @param score - Importance score (2-14 scale)
 * @returns Label string
 */
export function getImportanceLabelFromConfig(score: number): string {
  for (const threshold of IMPORTANCE_COLOR_CONFIG.thresholds) {
    if (score <= threshold.max) {
      return threshold.label;
    }
  }
  // Fallback to highest label
  return IMPORTANCE_COLOR_CONFIG.thresholds[IMPORTANCE_COLOR_CONFIG.thresholds.length - 1].label;
}

/**
 * Map importance thresholds to heat scale (0-145 points)
 * Heat v4: Derives heat color thresholds from importance configuration
 *
 * Formula: heatThreshold = ((importanceThreshold - min) / range) * BASE_IMPORTANCE_POINTS
 *
 * This ensures heat colors match importance proportions:
 * - If importance colors change, heat colors automatically adapt
 * - Heat base score (0-100) maps proportionally to importance range (2-14)
 * - Heat adjustments (±45) extend beyond base range with extrapolation
 */
function mapImportanceThresholdsToHeat() {
  const min = getMinImportance(); // Currently 2
  const range = getImportanceRange(); // Currently 12

  return IMPORTANCE_COLOR_CONFIG.thresholds.map(threshold => {
    // Normalize importance threshold to 0-1
    const normalized = (threshold.max - min) / range;

    // Map to heat base importance points (0-95)
    const heatBaseThreshold = normalized * HEAT_CONFIG.BASE_IMPORTANCE_POINTS;

    return {
      // Heat threshold extends to include potential adjustments
      // We use the base threshold as the color boundary
      max: heatBaseThreshold,
      color: threshold.color,
      label: threshold.label,
    };
  });
}

/**
 * Heat color thresholds derived from importance configuration
 * Heat v4: Automatically adapts when importance colors change
 *
 * Note: These thresholds are based on the BASE score (importance + recency = 0-100)
 * Heat adjustments (±45) can push tasks beyond these boundaries:
 * - Boosted tasks can exceed the red threshold
 * - Cooled tasks can fall below the blue threshold
 */
export const HEAT_COLOR_THRESHOLDS = mapImportanceThresholdsToHeat();

/**
 * Get color class for a heat score
 * Heat v4: Uses derived thresholds from importance configuration
 *
 * @param heat - Heat score (0-145 points)
 * @returns Tailwind color class
 */
export function getHeatColorFromConfig(heat: number): string {
  // For display purposes, we compare against base score thresholds
  // This ensures colors align with the base importance contribution
  // even when manual adjustments push heat beyond normal ranges

  for (const threshold of HEAT_COLOR_THRESHOLDS) {
    if (heat <= threshold.max) {
      return threshold.color;
    }
  }

  // If heat exceeds all thresholds (due to +45 adjustment), use red
  return IMPORTANCE_COLOR_CONFIG.thresholds[IMPORTANCE_COLOR_CONFIG.thresholds.length - 1].color;
}

/**
 * Get label for a heat score
 * Heat v4: Uses derived thresholds from importance configuration
 *
 * @param heat - Heat score (0-145 points)
 * @returns Label string
 */
export function getHeatLabelFromConfig(heat: number): string {
  for (const threshold of HEAT_COLOR_THRESHOLDS) {
    if (heat <= threshold.max) {
      return threshold.label;
    }
  }

  // If heat exceeds all thresholds, use highest label
  return IMPORTANCE_COLOR_CONFIG.thresholds[IMPORTANCE_COLOR_CONFIG.thresholds.length - 1].label;
}
