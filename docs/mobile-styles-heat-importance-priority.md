# Mobile Styling: Heat, Importance, Priority

This document specifies the mobile styling for heat and importance chips (colors only) and for task text styling dictated by priority (mirroring the current web app).

## Heat Chip Colors (0–145)

Heat colors derive from importance thresholds mapped to the heat base score. Final heat may exceed the base due to manual adjustments, but color mapping uses the base thresholds.

- Blue 400 `#60A5FA`: 0–8
- Green 400 `#4ADE80`: 9–24
- Yellow 400 `#FACC15`: 25–48
- Orange 400 `#FB923C`: 49–71
- Red 400 `#F87171`: 72–145

Notes:
- Thresholds reflect rounding of derived base boundaries (≈7.9, 23.8, 47.5, 71.3, 95).
- Values above 71 (typically boosted by manual adjustment) remain Red.

## Importance Chip Colors (score 2–14)

- Low (2–3): Blue 400 `#60A5FA`
- Medium‑Low (4–5): Green 400 `#4ADE80`
- Medium (6–8): Yellow 400 `#FACC15`
- Medium‑High (9–11): Orange 400 `#FB923C`
- High (12–14): Red 400 `#F87171`

Notes:
- These are the master thresholds; heat colors are proportionally derived from this scale.

## Priority → Task Text Styling (matches web app)

Priority controls the styling of the task title text (not a chip):

- Top (critical)
  - Weight: Bold/600–700
  - Color: Light `#990000`, Dark `#DD5555`
- High
  - Weight: Bold/600–700
  - Color: Light `#344C63`, Dark `#7A9EC6`
- Medium
  - Weight: Regular/400
  - Color: Default body text color
- Low
  - Weight: Light/300 (thin and light)
  - Color: Muted foreground (same as app’s “muted” text tone)

Implementation guidance:
- Keep tap targets and spacing unchanged; only text weight/color vary with priority.
- In dark mode, use the specified dark hexes for Top/High; Medium uses default, Low uses muted.

## Untouched Tasks (New/Uninteracted)

Definition (from API response):
- A task is considered “untouched” if both `lastTouchedAt` and `lastHeatTouchedAt` are null/absent.
  - Example JSON (untouched):
    ```json
    {
      "id": 123,
      "title": "New task",
      "createdAt": "2025-11-08T15:04:05.000Z",
      "lastTouchedAt": null,
      "lastHeatTouchedAt": null
    }
    ```

Behavior on mobile:
- Pin to top: Untouched tasks appear above all other tasks, regardless of sort mode.
- In-group sorting: Within the untouched group, sort by current mode (Heat or Importance). If tied, newest `createdAt` first.
- Visual highlight: Task title uses a green bold highlight until first touch.
  - Weight: Bold/600–700
  - Color: Green 400 `#4ADE80` (same in dark mode; ensure AA contrast)
  - This styling temporarily overrides Priority text styling. After the first interaction, revert to Priority-based styling.

What counts as a “touch”:
- Any interaction that sets either timestamp (e.g., editing, completing, changing priority, starring, heating/cooling, snoozing) clears the untouched state by populating `lastTouchedAt` and/or `lastHeatTouchedAt`.

