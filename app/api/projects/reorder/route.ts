import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { projectRepository } from "@/lib/db/repositories";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const projectIdsInput: unknown[] = Array.isArray(body.projectIds) ? body.projectIds : [];

    if (
      projectIdsInput.length === 0 ||
      projectIdsInput.some((id: unknown) => typeof id !== "number" || Number.isNaN(id))
    ) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 }
      );
    }

    const projectIds = projectIdsInput as number[];
    await projectRepository.reorder(projectIds, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder projects:", error);
    return NextResponse.json(
      { error: "Failed to reorder projects" },
      { status: 500 }
    );
  }
}
