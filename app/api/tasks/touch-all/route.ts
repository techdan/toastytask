import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

// Force Node.js runtime to ensure database client compatibility
export const runtime = 'nodejs';

/**
 * POST /api/tasks/touch-all
 *
 * Marks all "new" tasks as touched by setting their lastTouchedAt and lastHeatTouchedAt
 * to their createdAt date. This removes the "new" (green) status without artificially
 * boosting recency scores.
 */
export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Update all tasks where lastTouchedAt or lastHeatTouchedAt is null
    // Set them to the task's createdAt date to maintain accurate recency
    const db = getDatabase();
    const result = await db
      .update(tasks)
      .set({
        lastTouchedAt: sql`${tasks.createdAt}`,
        lastHeatTouchedAt: sql`${tasks.createdAt}`,
      })
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          // Only update tasks that are currently "new" (both timestamps null)
          isNull(tasks.lastTouchedAt),
          isNull(tasks.lastHeatTouchedAt)
        )
      )
      .returning({ id: tasks.id });

    const touchedCount = result.length;

    return NextResponse.json({
      success: true,
      touchedCount,
      message: `Marked ${touchedCount} task${touchedCount === 1 ? '' : 's'} as touched`,
    });

  } catch (error) {
    console.error('Error in touch-all endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
