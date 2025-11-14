import type { Task } from "@/types";

export interface SearchResult {
  type: "task" | "note";
  taskId: number;
  taskTitle: string;
  matchedText: string;
  highlightedText: string;
  projectId: number | null;
  projectName?: string;
  noteId?: number;
  context?: string;
}

/**
 * Escapes special regex characters in a string to use it as a literal pattern
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights matching text with <mark> tags for display
 */
function highlightMatch(text: string, pattern: RegExp): string {
  return text.replace(pattern, "<mark>$&</mark>");
}

/**
 * Extracts context around a match (for notes)
 */
function getContext(text: string, matchIndex: number, matchLength: number, contextChars = 50): string {
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + matchLength + contextChars);

  let context = text.slice(start, end);

  if (start > 0) {
    context = "..." + context;
  }
  if (end < text.length) {
    context = context + "...";
  }

  return context;
}

/**
 * Searches tasks by title and notes content
 *
 * @param tasks - Array of tasks to search through
 * @param searchQuery - Search query string
 * @param projectsMap - Optional map of project IDs to project names for enriching results
 * @returns Array of search results sorted by relevance
 */
export interface SearchOptions {
  includeCompleted?: boolean;
}

export function searchTasks(
  tasks: Task[],
  searchQuery: string,
  projectsMap?: Map<number, string>,
  options: SearchOptions = {}
): SearchResult[] {
  if (!searchQuery.trim()) {
    return [];
  }

  const results: SearchResult[] = [];
  const trimmedQuery = searchQuery.trim();
  const includeCompleted = options.includeCompleted ?? false;

  // Create case-insensitive regex pattern for matching
  const pattern = new RegExp(escapeRegex(trimmedQuery), "gi");

  for (const task of tasks) {
    // Skip completed tasks in search dropdown unless explicitly included
    if (!includeCompleted && task.completedAt) {
      continue;
    }

    const projectName = task.projectId && projectsMap
      ? projectsMap.get(task.projectId)
      : undefined;

    // Search in task title
    if (pattern.test(task.title)) {
      results.push({
        type: "task",
        taskId: task.id,
        taskTitle: task.title,
        matchedText: task.title,
        highlightedText: highlightMatch(task.title, new RegExp(escapeRegex(trimmedQuery), "gi")),
        projectId: task.projectId,
        projectName,
      });
    }

    // Search in notes
    if (task.notes && task.notes.length > 0) {
      for (const note of task.notes) {
        const noteText = note.currentText;
        const match = pattern.exec(noteText);

        if (match) {
          const context = getContext(noteText, match.index, match[0].length);

          results.push({
            type: "note",
            taskId: task.id,
            taskTitle: task.title,
            matchedText: noteText,
            highlightedText: highlightMatch(context, new RegExp(escapeRegex(trimmedQuery), "gi")),
            projectId: task.projectId,
            projectName,
            noteId: note.id,
            context,
          });
        }

        // Reset regex for next iteration
        pattern.lastIndex = 0;
      }
    }

    // Reset regex for next task
    pattern.lastIndex = 0;
  }

  // Sort results: task title matches first, then note matches
  // Within each group, sort alphabetically by task title
  return results.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "task" ? -1 : 1;
    }
    return a.taskTitle.localeCompare(b.taskTitle);
  });
}

/**
 * Filters search results by project
 */
export function filterResultsByProject(
  results: SearchResult[],
  projectId: number | null | "all"
): SearchResult[] {
  if (projectId === "all") {
    return results;
  }

  return results.filter(result => result.projectId === projectId);
}

/**
 * Groups search results by task
 */
export function groupResultsByTask(results: SearchResult[]): Map<number, SearchResult[]> {
  const grouped = new Map<number, SearchResult[]>();

  for (const result of results) {
    const existing = grouped.get(result.taskId) || [];
    existing.push(result);
    grouped.set(result.taskId, existing);
  }

  return grouped;
}

/**
 * Debounce function for search input
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}
