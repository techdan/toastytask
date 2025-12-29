/**
 * Importance & Heat Color Configuration
 *
 * Centralized color configuration for both importance and heat badges.
 * Heat colors are derived from importance thresholds, ensuring adaptability.
 */

import { getMinImportance, getImportanceRange } from "./importance-v1";
import { HEAT_CONFIG } from "./heat-config";

/**
 * Color thresholds based on importance score (2-14 scale)
 */
export const IMPORTANCE_COLOR_CONFIG = {
  thresholds: [
    { max: 3, color: "bg-blue-400", label: "Low" },
    { max: 5, color: "bg-green-400", label: "Medium-Low" },
    { max: 8, color: "bg-yellow-400", label: "Medium" },
    { max: 11, color: "bg-orange-400", label: "Medium-High" },
    { max: 14, color: "bg-red-400", label: "High" },
  ],
} as const;

/**
 * Get color class for an importance score
 */
export function getImportanceColorFromConfig(score: number): string {
  for (const threshold of IMPORTANCE_COLOR_CONFIG.thresholds) {
    if (score <= threshold.max) {
      return threshold.color;
    }
  }
  return IMPORTANCE_COLOR_CONFIG.thresholds[
    IMPORTANCE_COLOR_CONFIG.thresholds.length - 1
  ].color;
}

/**
 * Get label for an importance score
 */
export function getImportanceLabelFromConfig(score: number): string {
  for (const threshold of IMPORTANCE_COLOR_CONFIG.thresholds) {
    if (score <= threshold.max) {
      return threshold.label;
    }
  }
  return IMPORTANCE_COLOR_CONFIG.thresholds[
    IMPORTANCE_COLOR_CONFIG.thresholds.length - 1
  ].label;
}

/**
 * Map importance thresholds to heat scale (0-145 points)
 */
function mapImportanceThresholdsToHeat() {
  const min = getMinImportance();
  const range = getImportanceRange();

  return IMPORTANCE_COLOR_CONFIG.thresholds.map((threshold) => {
    const normalized = (threshold.max - min) / range;
    const heatBaseThreshold = normalized * HEAT_CONFIG.BASE_IMPORTANCE_POINTS;

    return {
      max: heatBaseThreshold,
      color: threshold.color,
      label: threshold.label,
    };
  });
}

/**
 * Heat color thresholds derived from importance configuration
 */
export const HEAT_COLOR_THRESHOLDS = mapImportanceThresholdsToHeat();

/**
 * Get color class for a heat score
 */
export function getHeatColorFromConfig(heat: number): string {
  for (const threshold of HEAT_COLOR_THRESHOLDS) {
    if (heat <= threshold.max) {
      return threshold.color;
    }
  }
  return IMPORTANCE_COLOR_CONFIG.thresholds[
    IMPORTANCE_COLOR_CONFIG.thresholds.length - 1
  ].color;
}

/**
 * Get label for a heat score
 */
export function getHeatLabelFromConfig(heat: number): string {
  for (const threshold of HEAT_COLOR_THRESHOLDS) {
    if (heat <= threshold.max) {
      return threshold.label;
    }
  }
  return IMPORTANCE_COLOR_CONFIG.thresholds[
    IMPORTANCE_COLOR_CONFIG.thresholds.length - 1
  ].label;
}
