# Heat Algorithm Analysis & Refinement

## Document Purpose

This document tracks analysis, experiments, and refinements to the Heat v2 scoring algorithm. The goal is to identify and fix issues with the current weight configuration to ensure the heat score properly reflects task importance and user intent.

## Current Algorithm Configuration (Baseline)

### Component Weights

```typescript
WEIGHT_BASE = 0.20         // 20% - Base importance (priority + star)
WEIGHT_RECENCY = 0.25      // 25% - Time since any touch
WEIGHT_HEAT_TOUCHES = 0.30 // 30% - Heat icon clicks (powerful override)
WEIGHT_DUE_PROXIMITY = 0.15 // 15% - Due date urgency
WEIGHT_ACTIVITY = 0.05     // 5% - Other touches (edits)
WEIGHT_CREATION = 0.05     // 5% - Creation recency (minimal, uses sort override)
```

### Decay Settings

```typescript
HEAT_DECAY_HALF_LIFE_HOURS = 168        // 7 days
HEAT_TOUCH_DECAY_HALF_LIFE_HOURS = 168  // 7 days
HEAT_TOUCH_CAP = 20                     // 20 heat clicks = max
ACTIVITY_CAP = 20                       // 20 other touches = max
CREATION_DECAY_DAYS = 60                // Creation boost diminishes over 60 days
```

### Component Formulas

1. **Base Importance**: `(importanceV1 - 2) / 10` → 0-1
   - importanceV1 ranges from 2-12 based on priority + star + due date

2. **Recency**: `exp(-hours_since_touch / 168)` → 0-1
   - Exponential decay with 7-day half-life

3. **Heat Touches**: `min(heat_touch_count / 20, 1.0)` → 0-1
   - Linear scaling, caps at 20 clicks

4. **Due Proximity**: `1 / (1 + exp(daysToDue))` → 0-1
   - Sigmoid curve, approaches 1 when past due

5. **Activity**: `log(1 + other_touch_count) / log(1 + 20)` → 0-1
   - Logarithmic scaling, caps at 20 touches

6. **Creation Recency**: `exp(-days_since_created / 60) * (1 - total_touches)` → 0-1
   - Drops to 0 after any touch

---

## Identified Issues

### Issue 1: Snoozing Increases Heat (Critical)

**Problem**: When a task is snoozed, recency changes from 0 to 25% contribution, causing heat to INCREASE instead of decrease.

**Example**:
- Task with no recent touches: recency = 0 → 0% contribution
- User snoozes task: `lastTouchedAt` updates to now
- Recency jumps to 1.0 → 25% contribution
- Net effect: Heat increases by up to 25 points

**Root Cause**: Recency weight (25%) is too high. Any touch action (including snooze) updates `lastTouchedAt`, which immediately maxes out the recency component.

**Expected Behavior**: Snoozing should ONLY decrease heat, never increase it.

**Impact**: High - breaks fundamental snooze UX assumption

---

### Issue 2: Due Proximity Creates Large Jumps

**Problem**: Small differences in days past due create large heat jumps that don't match user expectations.

**Example**:
- 2 days past due: sigmoid(2) = 0.88 → 13.2% heat contribution
- 3 days past due: sigmoid(3) = 0.95 → 14.3% heat contribution
- Difference: 1.1% heat jump for 1 day

While the example above shows modest jumps, the sigmoid curve may create unintuitive behavior in some ranges.

**Root Cause**: Sigmoid function may not scale appropriately across the full range (far future → many days past due), and 15% weight may be too high for this component.

**Potential Redundancy**: Due date is already factored into `importanceV1` (base importance), so due proximity might be double-counting urgency.

**Expected Behavior**:
- Far future due dates: minimal contribution (~1%)
- Coming week: gradual increase
- Past due: max out at 1-2 weeks overdue
- OR: Remove entirely if redundant with base importance

---

### Issue 3: Base Importance Weight Too Low

**Problem**: Tasks with high priority + past due dates have surprisingly low heat scores.

**Example**:
- Task: Priority = Top (4), Past due, Star = Yes
- importanceV1 = 12 (maximum)
- Base importance component: (12-2)/10 = 1.0
- Heat contribution: 1.0 * 20% = 20%
- Even with maximum base importance, task only gets 20% of heat budget
- **Actual observed heat: 34 (should be 70+)**

**Analysis**:
- A Top priority, starred, past-due task represents maximum user-declared importance
- With only 20% weight, it needs other components (recency, touches) to reach high heat
- This makes heat too dependent on interaction rather than inherent task importance

**Expected Behavior**:
- Top priority + past due + starred should yield heat ≥ 70
- Base importance should be the PRIMARY driver of heat
- Heat touches should be a BOOST, not a requirement

---

### Issue 4: Recency Weight Creates Perverse Incentives

**Problem**: High recency weight (25%) means ANY interaction (even snooze) significantly boosts heat.

**Analysis**:
- Recency at 25% is higher than base importance at 20%
- This suggests "recently touched" is more important than priority/due date
- Contradicts the design goal: heat should reflect task importance, with touches as override

**Expected Behavior**:
- Recency should provide minor boost to keep active tasks warm
- Should not dominate the score
- Suggested weight: 5% (same tier as activity)

---

## Proposed Algorithm Refinement

### Proposed Weight Distribution

```typescript
WEIGHT_BASE = 0.50            // 50% - Base importance (PRIMARY DRIVER)
WEIGHT_HEAT_TOUCHES = 0.30    // 30% - Heat icon clicks (manual override) - UNCHANGED
WEIGHT_RECENCY = 0.05         // 5% - Time since any touch (minor boost)
WEIGHT_DUE_PROXIMITY = 0.05   // 5% - Due date urgency (or 0% if redundant)
WEIGHT_ACTIVITY = 0.05        // 5% - Other touches (edits)
WEIGHT_CREATION = 0.05        // 5% - Creation recency (minimal)
```

**Total**: 100%

### Rationale

1. **Base Importance = 50%**:
   - Makes priority + star + due date the primary driver
   - Ensures high-priority tasks always have high base heat
   - Aligns with user expectations: "important tasks should be hot"

2. **Heat Touches = 30%** (unchanged):
   - Preserves manual override capability
   - 20 clicks still adds 30% → powerful boost
   - Combined with 50% base = up to 80% heat before other factors

3. **Recency = 5%**:
   - Drastically reduced from 25%
   - Provides minor "active task" boost
   - **Critical**: Prevents snooze from increasing heat
   - Max contribution: 5% (minimal impact)

4. **Due Proximity = 5%** (or remove):
   - Reduced from 15%
   - Provides slight urgency boost if not redundant
   - Consider removing entirely if importanceV1 already captures due date adequately

5. **Activity = 5%** (unchanged):
   - Logarithmic scaling already limits impact
   - Appropriate for "engagement" signal

6. **Creation = 5%** (unchanged):
   - Already minimal
   - Drops to 0 after any touch

---

## Analysis Framework

### Testing Methodology

For each weight configuration, test against these canonical task scenarios:

#### Scenario 1: High Priority Past Due (No Touches)
```
Priority: Top (4)
Star: Yes
Due: 3 days past due
importanceV1: 12
heatTouchCount: 0
otherTouchCount: 0
lastTouchedAt: null
```

**Expected Heat**: 70-80
**Current Heat**: ~34
**Component Breakdown** (Current):
- Base: 1.0 * 20% = 20%
- Recency: 0 * 25% = 0%
- Heat Touches: 0 * 30% = 0%
- Due Proximity: 0.95 * 15% = 14.3%
- Activity: 0 * 5% = 0%
- Creation: 1.0 * 5% = 5%
- **Total: 39.3%**

**Component Breakdown** (Proposed 50/30/5/5/5/5):
- Base: 1.0 * 50% = 50%
- Recency: 0 * 5% = 0%
- Heat Touches: 0 * 30% = 0%
- Due Proximity: 0.95 * 5% = 4.75%
- Activity: 0 * 5% = 0%
- Creation: 1.0 * 5% = 5%
- **Total: 59.75% → Too low, need 70+**

**Adjustment Needed**: Even 50% base may not be enough. Consider:
- Due proximity might need higher weight if it's distinct from importanceV1
- OR importanceV1 calculation itself may need review

---

#### Scenario 2: Snoozed Task (Recency Bug)
```
Priority: Medium (2)
Star: No
Due: 7 days from now
importanceV1: 6
heatTouchCount: 5
otherTouchCount: 2
lastTouchedAt: null (before snooze)
```

**Action**: User snoozes for 7 days
**Current Behavior**: lastTouchedAt updates to now → recency jumps from 0 to 1.0

**Component Breakdown** (Before Snooze - Current):
- Base: 0.4 * 20% = 8%
- Recency: 0 * 25% = 0%
- Heat Touches: 0.25 * 30% = 7.5% (5/20 clicks, with decay applied)
- Due Proximity: 0.001 * 15% = 0.015%
- Activity: 0.228 * 5% = 1.14%
- Creation: 0 * 5% = 0%
- **Total: 16.655%**

**Component Breakdown** (After Snooze - Current):
- Base: 0.4 * 20% = 8%
- Recency: 1.0 * 25% = **25%** ← PROBLEM!
- Heat Touches: reduced by decay
- Due Proximity: 0.001 * 15% = 0.015%
- Activity: 0.228 * 5% = 1.14%
- Creation: 0 * 5% = 0%
- **Total: ~34% → INCREASED by ~18%!**

**Component Breakdown** (After Snooze - Proposed 50/30/5/5/5/5):
- Base: 0.4 * 50% = 20%
- Recency: 1.0 * 5% = **5%** ← FIXED!
- Heat Touches: reduced by decay
- Due Proximity: 0.001 * 5% = 0.005%
- Activity: 0.228 * 5% = 1.14%
- Creation: 0 * 5% = 0%
- **Total: ~26% → Only increased by ~10% (still an issue but much better)**

**Note**: Even with 5% recency, snooze still increases heat slightly. Need to investigate snooze-specific logic.

---

#### Scenario 3: Medium Priority, Well-Touched
```
Priority: Medium (2)
Star: No
Due: None
importanceV1: 4
heatTouchCount: 10
otherTouchCount: 5
lastTouchedAt: 2 days ago
```

**Expected Heat**: 50-60
**Component Breakdown** (Current):
- Base: 0.2 * 20% = 4%
- Recency: 0.74 * 25% = 18.5%
- Heat Touches: 0.5 * 30% = 15%
- Due Proximity: 0 * 15% = 0%
- Activity: 0.588 * 5% = 2.94%
- Creation: 0 * 5% = 0%
- **Total: 40.44%**

**Component Breakdown** (Proposed):
- Base: 0.2 * 50% = 10%
- Recency: 0.74 * 5% = 3.7%
- Heat Touches: 0.5 * 30% = 15%
- Due Proximity: 0 * 5% = 0%
- Activity: 0.588 * 5% = 2.94%
- Creation: 0 * 5% = 0%
- **Total: 31.64%**

**Analysis**: Proposed weights DECREASE heat for this scenario. Is this desirable?
- User has touched task 10 times (heat) + 5 edits
- But priority is only Medium, no due date
- Heat 31% seems reasonable for "medium importance, actively worked"
- Current 40% may be inflated by high recency weight

---

#### Scenario 4: Low Priority, Recent, No Touches
```
Priority: Low (1)
Star: No
Due: None
importanceV1: 2
heatTouchCount: 0
otherTouchCount: 0
lastTouchedAt: 1 hour ago (just created)
createdAt: 1 hour ago
```

**Expected Heat**: 20-30 (new task boost, but low importance)
**Component Breakdown** (Current):
- Base: 0 * 20% = 0%
- Recency: 1.0 * 25% = 25%
- Heat Touches: 0 * 30% = 0%
- Due Proximity: 0 * 15% = 0%
- Activity: 0 * 5% = 0%
- Creation: 1.0 * 5% = 5%
- **Total: 30%**

**Component Breakdown** (Proposed):
- Base: 0 * 50% = 0%
- Recency: 1.0 * 5% = 5%
- Heat Touches: 0 * 30% = 0%
- Due Proximity: 0 * 5% = 0%
- Activity: 0 * 5% = 0%
- Creation: 1.0 * 5% = 5%
- **Total: 10%**

**Analysis**:
- Proposed weights drop new low-priority task to 10% (freezing)
- Current gives 30% (cooling)
- BUT: New tasks use **sort override** to appear at top regardless
- So heat value doesn't matter for visibility
- 10% is appropriate for low-priority untouched task

---

## Due Proximity Deep Dive

### Question: Is Due Proximity Redundant?

**importanceV1 Formula** (from base scoring):
```typescript
// importanceV1 includes due date urgency
importance = priority_points + star_points + due_date_points
```

If `importanceV1` already factors in due date, why have a separate `dueProximity` component?

**Hypothesis**: Due proximity provides TIME-SENSITIVE urgency that importanceV1 may not capture.
- importanceV1 calculated at task creation/edit
- dueProximity calculated dynamically with each heat refresh
- Allows heat to increase as due date approaches, even without user interaction

**Test**: Compare heat scores with/without dueProximity for same task over time.

**Alternative**: If dueProximity is kept, it should have MINIMAL weight (5% or less) to avoid double-counting.

---

## Proposed Experiments

### Experiment 1: Proposed Weights (50/30/5/5/5/5)

**Config**:
```typescript
WEIGHT_BASE = 0.50
WEIGHT_HEAT_TOUCHES = 0.30
WEIGHT_RECENCY = 0.05
WEIGHT_DUE_PROXIMITY = 0.05
WEIGHT_ACTIVITY = 0.05
WEIGHT_CREATION = 0.05
```

**Test Cases**: Run all 4 scenarios above
**Expected Outcomes**:
- Scenario 1: Heat increases from 39% to 60% (still below 70 target)
- Scenario 2: Snooze impact reduced from +18% to +5%
- Scenario 3: Heat decreases from 40% to 32% (acceptable)
- Scenario 4: Heat decreases from 30% to 10% (acceptable, sort override handles visibility)

**Issues to Watch**:
- Scenario 1 still below 70% target → may need to investigate importanceV1 calculation
- Scenario 2 snooze still increases heat (need snooze-specific fix)

---

### Experiment 2: Remove Due Proximity (50/30/10/0/5/5)

**Config**:
```typescript
WEIGHT_BASE = 0.50
WEIGHT_HEAT_TOUCHES = 0.30
WEIGHT_RECENCY = 0.10
WEIGHT_DUE_PROXIMITY = 0.00  // REMOVED
WEIGHT_ACTIVITY = 0.05
WEIGHT_CREATION = 0.05
```

**Rationale**: If due date is already in importanceV1, dueProximity is redundant

**Test**: Compare Scenario 1 (high priority past due) with/without dueProximity
- Current: 39.3% (includes 14.3% from dueProximity)
- Without: 25% (loses 14.3% contribution)
- This suggests dueProximity IS providing value not captured by importanceV1

**Conclusion**: Keep dueProximity but at reduced weight (5%)

---

### Experiment 3: Higher Base Weight (60/30/5/0/5/0)

**Config**:
```typescript
WEIGHT_BASE = 0.60
WEIGHT_HEAT_TOUCHES = 0.30
WEIGHT_RECENCY = 0.05
WEIGHT_DUE_PROXIMITY = 0.00
WEIGHT_ACTIVITY = 0.05
WEIGHT_CREATION = 0.00
```

**Rationale**:
- Maximize base importance to hit 70% target for Scenario 1
- Remove due proximity (redundant)
- Remove creation (handled by sort override)

**Test Scenario 1**:
- Base: 1.0 * 60% = 60%
- Heat Touches: 0 * 30% = 0%
- Recency: 0 * 5% = 0%
- Activity: 0 * 5% = 0%
- **Total: 60%**

Still below 70% target! This suggests importanceV1 itself may need review.

---

### Experiment 4: Investigate importanceV1 Calculation

**Question**: Does importanceV1 properly reflect priority + due urgency?

**Test**: For Top priority, starred, 3 days past due:
- What is the actual importanceV1 value?
- Is it 12 (maximum) as assumed?
- Or is it lower?

**Action**: Review `lib/scoring/importance.ts` to understand importanceV1 formula

**If importanceV1 < 12 for Scenario 1**: This explains low heat
**If importanceV1 = 12**: Then even 60% base weight only gives 60% heat, not 70%

**Possible Solutions**:
1. Increase base weight to 70% (leaves only 30% for heat touches)
2. Adjust importanceV1 formula to give higher scores
3. Accept that 60% base + heat touches is sufficient (60% + 15% touches = 75%)

---

## Snooze-Specific Fix

### Problem: Snooze Updates lastTouchedAt

**Current Behavior**:
```typescript
// Snooze updates lastTouchedAt
task.lastTouchedAt = now
// This causes recency to jump from 0 to 1.0
```

**Proposed Solutions**:

#### Option 1: Don't Update lastTouchedAt on Snooze
```typescript
// Snooze sets nextSurfaceAt and applies decay, but does NOT touch lastTouchedAt
task.nextSurfaceAt = nextSurfaceAt
task.heatTouchCount *= decayFactor
// lastTouchedAt unchanged
```

**Pros**: Prevents recency jump
**Cons**: Recency will continue to decay while snoozed (desired?)

#### Option 2: Negative Recency Boost for Snooze
```typescript
// Snooze applies a negative recency modifier
task.lastTouchedAt = now - snoozeDuration
// This makes recency decay as if time already passed
```

**Pros**: Natural decay representation
**Cons**: Manipulating timestamp feels hacky

#### Option 3: Separate Snooze Flag
```typescript
// Add isSnoozed flag, recency ignores lastTouchedAt if snoozed
if (task.nextSurfaceAt) {
  recency = 0  // Force recency to 0 while snoozed
}
```

**Pros**: Clean separation, recency doesn't interfere
**Cons**: Adds complexity

**Recommendation**: **Option 3** - Cleanest approach, ensures snooze never increases heat via recency

---

## Next Steps

1. **Implement Experiment 1** (50/30/5/5/5/5)
   - Update constants in `lib/scoring/heat-v2.ts`
   - Test against 4 scenarios
   - Document actual heat values

2. **Investigate importanceV1**
   - Review `lib/scoring/importance.ts`
   - Verify Scenario 1 task has importanceV1 = 12
   - If not, identify why

3. **Implement Snooze Fix** (Option 3)
   - Add recency = 0 when nextSurfaceAt is set
   - Test snooze doesn't increase heat

4. **Iterate Based on Results**
   - If Scenario 1 still below 70%, consider higher base weight
   - If snooze behavior correct, verify with user testing

5. **Document Final Configuration**
   - Update heat-requirements-v2.md with refined weights
   - Add analysis to explain rationale

---

## Success Criteria

✅ **Snoozing never increases heat** (critical fix)
✅ **Top priority + past due = 70+ heat** (proper importance weighting)
✅ **Small due date differences = small heat differences** (smooth scaling)
✅ **Heat touches remain powerful** (30% weight preserved)
✅ **New task sort override works** (independent of heat value)

---

## Change Log

### 2025-01-XX - Initial Analysis
- Documented current algorithm (20/25/30/15/5/5)
- Identified 4 critical issues
- Proposed refined weights (50/30/5/5/5/5)
- Created testing framework
- Designed 4 canonical scenarios
