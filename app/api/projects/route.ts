import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { projectRepository } from "@/lib/db/repositories";
import type { NewProject } from "@/types";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/projects - List all projects
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const projects = await projectRepository.findAll(userId, includeArchived);

    // Sort by name
    projects.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const projectData: NewProject = {
      name: body.name,
      colorHex: body.colorHex || "#6b7280",
      archived: false,
    };

    const project = await projectRepository.create(projectData, userId);

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
