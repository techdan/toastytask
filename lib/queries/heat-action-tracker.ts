const actionCounters = new Map<number, number>();
const latestServerMutationTimestamps = new Map<number, number>();

/**
 * Registers a new heat/cool mutation for a task and returns the action id for race tracking.
 */
export function registerHeatAction(taskId: number): number {
  const nextActionId = (actionCounters.get(taskId) ?? 0) + 1;
  actionCounters.set(taskId, nextActionId);
  return nextActionId;
}

/**
 * Determines whether a response should be applied based on the most recent action id
 * and the latest server mutation timestamp observed for the task.
 */
export function shouldProcessHeatActionResponse(
  taskId: number,
  actionId?: number,
  serverMutationTimestamp?: number
): boolean {
  const latestActionId = actionCounters.get(taskId);
  if (
    actionId !== undefined &&
    latestActionId !== undefined &&
    actionId < latestActionId
  ) {
    return false;
  }

  if (serverMutationTimestamp === undefined) {
    return true;
  }

  const latestServerTimestamp = latestServerMutationTimestamps.get(taskId);
  if (
    latestServerTimestamp !== undefined &&
    serverMutationTimestamp < latestServerTimestamp
  ) {
    return false;
  }

  latestServerMutationTimestamps.set(taskId, serverMutationTimestamp);
  return true;
}

/**
 * Utility helper to normalize mutation timestamps (server or client provided dates).
 */
export function extractMutationTimestamp(
  timestamp: number | string | Date | null | undefined
): number | undefined {
  if (typeof timestamp === "number") {
    return timestamp;
  }
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}
