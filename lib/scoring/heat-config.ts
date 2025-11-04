/**
 * Heat Algorithm V3/V4 - Configuration Constants
 *
 * Single source of truth for all heat algorithm constants.
 * All values centralized here for easy tuning.
 *
 * Heat V4 Update: Changed from 0-1 normalized scale to 0-145 point-based system
 * - Base importance + recency: 0-100 points (base score)
 * - Heat adjustment: ±45 points (manual override)
 * - Final heat range: 0-145 points
 *
 * See: docs/heat-algorithm-v3.md
 */

export const HEAT_CONFIG = {
  // ========================================
  // Heat V4: Point-Based System
  // ========================================

  // Base score components (sum to 100 points)
  BASE_IMPORTANCE_POINTS: 95,  // Importance contributes 0-95 points
  RECENCY_POINTS: 5,           // Recency contributes 0-5 points
  MAX_BASE_SCORE: 100,         // BASE_IMPORTANCE + RECENCY

  // Manual adjustment range
  MAX_ADJUSTMENT_POINTS: 45,   // Heat adjustment ±45 points

  // Final heat score range
  MIN_FINAL_SCORE: 0,          // Floor at zero
  MAX_FINAL_SCORE: 145,        // MAX_BASE_SCORE + MAX_ADJUSTMENT_POINTS

  // ========================================
  // Legacy V3 Weights (deprecated but kept for reference)
  // ========================================

  // Component weights (must sum to 1.0)
  WEIGHT_BASE: 0.50,        // 50% - Priority + due + star (primary driver)
  WEIGHT_ADJUSTMENT: 0.45,  // 45% - Manual heat adjustment (also serves as min/max cap)
  WEIGHT_RECENCY: 0.05,     // 5% - Time since last interaction

  // Heat adjustment bounds (still used for decay calculations)
  MIN_HEAT_ADJUSTMENT: -45,    // Minimum heat adjustment (cool cap)
  MAX_HEAT_ADJUSTMENT: 45,     // Maximum heat adjustment (heat cap)

  // ========================================
  // Decay & Behavior (unchanged from V3)
  // ========================================

  // Decay rates (in days)
  HEAT_HALF_LIFE_DAYS: 7,   // Heat decays slowly (persistent preference)
  COOL_HALF_LIFE_DAYS: 3,   // Cool decays quickly (temporary deferral)

  // Context-aware increment caps (expressed directly in points)
  MAX_BOOST_PER_CLICK: 5,    // Max heat increase per click
  MAX_DROP_PER_CLICK: 10,    // Max heat decrease per click
  COOL_SKIP_POSITIONS: 3,     // Number of positions to skip when cooling

  // Base importance scale (deprecated - use getMaxImportance() from importance-v1.ts)
  BASE_IMPORTANCE_MAX: 14,  // Max base importance (priority 5 + star 3 + due 6)

  // Heat staleness threshold
  HEAT_STALENESS_HOURS: 6,  // Recalculate if older than 6 hours
} as const;

/**
 * Star level configuration
 */
export const STAR_CONFIG = {
  LEVELS: {
    NONE: 0,
    BLUE: 1,
    YELLOW: 2,
    ORANGE: 3,
  },
  MAX_LEVEL: 3,
  POINTS: {
    0: 0,  // None
    1: 1,  // Blue
    2: 2,  // Yellow
    3: 3,  // Orange
  },
} as const;

/**
 * Glow level thresholds for heat/cool buttons
 * Based on absolute value of adjustment (max is 45 points)
 */
export const GLOW_CONFIG = {
  THRESHOLDS: {
    STRONG: 14,  // Level 3: Strong glow (~31%+)
    MEDIUM: 7,   // Level 2: Medium glow (~16-30%)
    LIGHT: 1,    // Level 1: Light glow (>=1 point)
  },
} as const;
