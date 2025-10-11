import { NextResponse } from "next/server";
import { projectRepository } from "@/lib/db/repositories";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// PATCH /api/projects/[id] - Update a project
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const body = await request.json();
    const updates: { name?: string; colorHex?: string; archived?: boolean } = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.colorHex !== undefined) updates.colorHex = body.colorHex;
    if (body.archived !== undefined) updates.archived = body.archived;

    const project = await projectRepository.update(projectId, updates);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE /api/projects/[id] - Delete a project (hard delete)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    // Note: This will fail if there are tasks referencing this project
    // due to foreign key constraint. Consider archiving instead.
    await projectRepository.delete(projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: "Failed to delete project. It may have associated tasks." },
      { status: 500 }
    );
  }
}
