import { NextResponse } from "next/server";
import { projectRepository } from "@/lib/db/repositories";
import type { NewProject } from "@/types";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/projects - List all projects
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    let projects = await projectRepository.findAll(includeArchived);

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
    const body = await request.json();
    const projectData: NewProject = {
      name: body.name,
      colorHex: body.colorHex || "#6b7280",
      archived: false,
    };

    const project = await projectRepository.create(projectData);

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
