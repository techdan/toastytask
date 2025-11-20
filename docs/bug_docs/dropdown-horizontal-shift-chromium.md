# Horizontal Shift Bug: Dropdown Rendering on Lower Tasks

## Summary
When clicking priority, project, or recurrence columns on tasks positioned lower in a long list (40+ tasks), the table shifts horizontally to the left during the text-to-dropdown transition, before dropdown options appear.

## Environment
- **Affected Browsers**: Chrome, Comet (Chromium-based browsers)
- **Not Affected**: Firefox
- **When**: Only occurs for tasks lower in the list after scrolling (not viewport-dependent, but position-in-list dependent)

## Symptoms
1. Horizontal shift (left) of the due date, priority, project, and recurrence columns
2. Occurs during cell state change from text button to dropdown Select component
3. Happens before the dropdown portal content appears
4. Only affects tasks at position ~40+ in the list
5. Top tasks in the same viewport work correctly

## Technical Details

### Component Behavior
The affected select components use a conditional rendering pattern:
- When closed (`isOpen === false`): Renders as a text button
- When open (`isOpen === true`): Renders as a Radix UI Select with SelectTrigger

The shift occurs during this transition, suggesting a Chromium layout calculation issue.

### Attempted Fixes (All Failed)
1. ✗ Added `sideOffset` and `collisionPadding` to SelectContent
2. ✗ Changed `position="popper"` to `position="item-aligned"`
3. ✗ Added CSS rules for scroll anchoring and portal containment
4. ✗ Applied `table-layout: fixed` to force column widths
5. ✗ Added `overflow-x: clip` to prevent horizontal scrollbar
6. ✗ Applied `contain: layout` and `will-change: transform` to portals

### Root Cause Hypothesis
This appears to be a Chromium rendering engine bug related to:
- Layout calculation when DOM elements transition from inline button to Select component
- Accumulated rendering state after many repeated table rows (tbody elements)
- Possible interaction between table layout algorithm and portal positioning calculations

Since Firefox handles this correctly, the issue is browser-specific rather than a logical error in the code.

## Affected Components
- [components/tasks/priority-select.tsx](../../components/tasks/priority-select.tsx)
- [components/tasks/project-select.tsx](../../components/tasks/project-select.tsx)
- [components/tasks/recurrence-select.tsx](../../components/tasks/recurrence-select.tsx)

## Additional Notes

### Firefox Observations
- No horizontal shift occurs
- Table is slightly wider overall
- In comfortable display mode, right edge gets cut off
- This suggests Firefox calculates table/column widths differently

### Positioning Behavior
- Earlier: Dropdowns rendered above selected item (still had shift)
- Current: Dropdowns render below selected item (still has shift)
- This confirms the shift is unrelated to dropdown portal positioning direction

## Status
**Open** - No effective solution found. This may require:
- Chromium bug report
- Alternative component approach (avoid conditional rendering pattern)
- Accept as browser quirk and document for users
- Consider using a different dropdown library that doesn't trigger this behavior

## Workarounds Considered
1. Keep dropdowns always mounted (performance impact)
2. Use native select elements (lose styling control)
3. Implement custom dropdown with different rendering approach
4. Force Firefox as recommended browser for this app
