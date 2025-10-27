# Task List Table Layout Migration Plan

## Background
- The task list uses nested `<div>` grids for column layout (`TaskListHeader`, `TaskRow`), causing persistent alignment issues between header and body cells.
- The grid approach complicates column width management, padding consistency, and accessibility semantics (e.g., column headers are not true table headers).
- Migrating to semantic table elements should simplify alignment, improve screen reader support, and make future column management easier.

## Current State Summary
- `TaskList` renders a header component and a list of `TaskRow` components inside a flex/grid container.
- Columns include: checkbox, importance badge, star toggle, notes toggle, task title (editable), due date picker, priority select, recurrence select, and delete button.
- `TaskRow` optionally renders a notes panel `<div>` right after the main grid row.
- Widths are enforced through Tailwind classes (e.g., `w-[120px]` for due date) and custom padding inside child controls.

## Goals for the Table Migration
- Preserve all existing interactive behavior (inline editing, toggles, date picker, dropdowns, hover actions).
- Achieve reliable horizontal alignment by letting the browser handle column layout through `<table>` semantics.
- Improve accessibility by using proper `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th scope="col">`, and `<td>` elements.
- Maintain current styling, theming, and hover states while reducing ad-hoc padding adjustments.
- Keep the implementation flexible for future columns (e.g., sorting indicators, additional metadata).

## Proposed Table Structure
### Core Markup
- Wrap the list in a new `TaskTable` component returning:
  ```tsx
  <table className="w-full table-fixed border-separate border-spacing-y-2">
    <thead>…</thead>
    <tbody>…</tbody>
  </table>
  ```
- Use `table-fixed` to respect explicit column widths and `border-spacing` to recreate current row gaps.
- Define column widths via `<colgroup>` to consolidate width definitions:
  ```tsx
  <colgroup>
    <col className="w-8" />      // checkbox
    <col className="w-8" />      // importance
    <col className="w-8" />      // star
    <col className="w-8" />      // notes
    <col className="w-auto" />   // task title
    <col className="w-[120px]" />
    <col className="w-[90px]" />
    <col className="w-[100px]" />
    <col className="w-10" />     // actions
  </colgroup>
  ```

### Header Row
- Convert `TaskListHeader` to render `<thead>` with a single `<tr>`.
- Each column header becomes `<th scope="col" className="px-2 text-xs font-medium text-muted-foreground text-left">`.
- Keep the show/hide completed toggle in the final header cell; ensure buttons remain accessible by wrapping them in `<div>` or `<span>` if needed.

### Body Rows
- Convert `TaskRow` to output:
  ```tsx
  <tr className={cn("rounded border bg-card transition-colors", hover classes)}>{cells}</tr>
  ```
- Each column becomes a `<td className="px-2 py-1.5 align-middle">` and hosts the existing interactive components.
- Use `aria-label` and `title` attributes on icon buttons to ensure table context is clear for screen readers.

### Expanded Notes Panel
- When notes are expanded, render a follow-up `<tr>` with one `<td colSpan={columnCount}>` containing `TaskNotesPanel`.
- Style the expanded row with matching background and border to visually connect it with the parent row.

### Responsive & Scroll Handling
- Wrap the table in a container with `overflow-x-auto` (`TaskList` wrapper) so narrow viewports can scroll horizontally.
- For compact view modes in the future, consider toggling `table-auto` and adjusting column visibility through CSS classes.

## Migration Strategy
1. **Scaffold table component**  
   - Create `TaskTable` (or adapt `TaskList`) to render `<table>`, `<colgroup>`, `<thead>`, `<tbody>`.
   - Keep the existing data flow and props unchanged initially.

2. **Convert header to `<thead>`**  
   - Update `TaskListHeader` to emit `<thead><tr><th>…</th></tr></thead>`.
   - Ensure the completed toggle remains functional and accessible.

3. **Convert rows to `<tr>/<td>`**  
   - Refactor `TaskRow` markup into table cells; reuse existing components inside each `<td>`.
   - Move row hover/selection styles to classnames on `<tr>` and apply necessary `rounded` styling via pseudo-elements or utility classes (e.g., `after` backgrounds) since `<tr>` cannot be directly rounded without `border-separate`.

4. **Handle expanded notes**  
   - Introduce a conditional `<tr>` immediately following the main row with `colSpan` to host `TaskNotesPanel`.
   - Add transition/padding to match current visuals.

5. **Adjust styling for child controls**  
   - Remove grid-specific padding/margin overrides added earlier (e.g., zero padding buttons) once table cells provide consistent spacing.
   - Validate that dropdowns, date picker, and hover actions still align within fixed column widths.

6. **Regression pass & cleanup**  
   - Verify dark/light theme parity, hover states, focus rings, and spacing.
   - Remove any now-unused CSS classes or helper wrappers introduced solely for grid alignment.

## Risks & Mitigations
- **Table styling limitations**: Rounded corners and row gaps are trickier with tables. Mitigate by using `border-separate` and controlled `border-spacing`, or wrap row content inside `<div className="rounded">`.
- **Interactive content layout**: Select components and date pickers may need explicit width or display adjustments inside `<td>`. Plan to test each interactive control thoroughly.
- **Responsive behavior**: Tables can overflow on small screens. Preserve horizontal scroll on the container and consider future responsive variations (e.g., stacking columns) if mobile becomes a requirement.
- **Accessibility regressions**: Ensure `scope="col"`, `aria-sort` (future), and descriptive labels are applied so screen readers benefit from the semantic structure.

## Validation Plan
- Manual UI inspection in light/dark themes and various window widths.
- Keyboard navigation test: tabbing through cells, activating controls, toggling notes, opening dropdowns.
- Screen reader smoke test (NVDA/VoiceOver) to confirm header announcements.
- Visual diff or storybook snapshot (if available) comparing before/after alignment.

## Open Questions
- Should we introduce sticky headers while moving to a table layout?
- Do we need responsive variants (e.g., mobile stacking) immediately, or can that remain a follow-up?
- Are there analytics or telemetry requirements to monitor table adoption/behavior?

## Next Steps
- Estimate engineering effort for the migration (likely 1–2 dev-days plus QA).
- Schedule implementation work, potentially behind a feature flag if safe rollout is required.
- After implementation, revisit column alignment tweaks applied earlier and remove obsolete code.
