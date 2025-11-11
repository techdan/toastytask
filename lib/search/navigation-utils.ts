/**
 * Scrolls to a task element by ID with smooth animation
 */
export function scrollToTask(taskId: number, options?: ScrollIntoViewOptions): void {
  const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);

  if (taskElement) {
    taskElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
      ...options,
    });
  }
}

/**
 * Highlights a task element temporarily
 */
export function highlightTask(taskId: number, duration = 2000): void {
  const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);

  if (!taskElement) return;

  // Add highlight class
  taskElement.classList.add("search-highlight");

  // Remove highlight after duration
  setTimeout(() => {
    taskElement.classList.remove("search-highlight");
  }, duration);
}

/**
 * Scrolls to a task and highlights it
 */
export function navigateToTask(taskId: number, highlightDuration = 2000): void {
  scrollToTask(taskId);

  // Wait for scroll animation before highlighting
  setTimeout(() => {
    highlightTask(taskId, highlightDuration);
  }, 300);
}

/**
 * Expands notes section if collapsed (for note search results)
 */
export function expandTaskNotes(taskId: number): void {
  const notesToggle = document.querySelector(`[data-notes-toggle="${taskId}"]`);

  if (notesToggle instanceof HTMLElement) {
    // Check if notes are collapsed
    const notesSection = document.querySelector(`[data-notes-section="${taskId}"]`);
    const isCollapsed = notesSection?.getAttribute("data-collapsed") === "true";

    if (isCollapsed) {
      notesToggle.click();
    }
  }
}

/**
 * Navigates to a note within a task (expands notes and scrolls to task)
 */
export function navigateToNote(taskId: number): void {
  // First expand the notes section
  expandTaskNotes(taskId);

  // Wait for expansion animation
  setTimeout(() => {
    // Scroll to the task
    scrollToTask(taskId);

    // Highlight the task
    setTimeout(() => {
      highlightTask(taskId, 2000);
    }, 300);
  }, 100);
}
