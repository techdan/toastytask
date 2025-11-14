export const PRIMARY_TASKS_QUERY_FILTER = {
  includeCompleted: true,
} as const;

export const PRIMARY_TASKS_QUERY_KEY = ["tasks", PRIMARY_TASKS_QUERY_FILTER] as const;
