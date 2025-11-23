"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBreakpoint } from "@/lib/hooks/use-breakpoint";
import { TaskDetailScreen } from "@/components/tasks/task-detail-screen";

function TaskDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const breakpoint = useBreakpoint();

  const taskIdParam = params?.id;
  const taskId = typeof taskIdParam === "string" ? parseInt(taskIdParam, 10) : Array.isArray(taskIdParam) ? parseInt(taskIdParam[0], 10) : NaN;

  const mode = breakpoint === "mobile" ? "fullscreen" : "modal";

  if (!taskId || Number.isNaN(taskId)) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Invalid task id
      </div>
    );
  }

  return (
    <TaskDetailScreen
      taskId={taskId}
      onClose={() => router.back()}
      mode={mode}
    />
  );
}

export default function TaskDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-muted-foreground">
          Loading task...
        </div>
      }
    >
      <TaskDetailPageContent />
    </Suspense>
  );
}
