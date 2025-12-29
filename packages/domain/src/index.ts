/**
 * @toasty/domain
 *
 * Shared domain logic for Toasty Task.
 * Contains scoring algorithms (heat and importance) that work on both web and mobile.
 */

// Scoring - Heat
export {
  calculateHeat,
  calculateHeatWithBreakdown,
  applyAsymmetricDecay,
  calculateHeatBoost,
  calculateCoolDrop,
  getHeatStage,
  getHeatColor,
  getHeatLabel,
  getGlowLevel,
  isHeatStale,
  clampHeatAdjustment,
} from "./scoring/heat-v3";

export type {
  HeatV3Breakdown,
  HeatStage,
  DecayResult,
  GlowLevel,
  HeatTask,
} from "./scoring/heat-v3";

// Scoring - Importance
export {
  calculateImportanceV1,
  calculateImportanceV1WithFactors,
  getImportanceColor,
  getImportanceLabel,
  getMinImportance,
  getMaxImportance,
  getImportanceRange,
  IMPORTANCE_CONFIG,
} from "./scoring/importance-v1";

export type {
  ImportanceV1Factors,
  ImportanceTask,
} from "./scoring/importance-v1";

// Scoring - Configuration
export { HEAT_CONFIG, STAR_CONFIG, GLOW_CONFIG } from "./scoring/heat-config";

// Scoring - Colors
export {
  IMPORTANCE_COLOR_CONFIG,
  HEAT_COLOR_THRESHOLDS,
  getImportanceColorFromConfig,
  getImportanceLabelFromConfig,
  getHeatColorFromConfig,
  getHeatLabelFromConfig,
} from "./scoring/importance-colors";

// Utilities
export { toDate, daysBetween, clamp } from "./utils/date";
