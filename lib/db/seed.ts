import { getDatabase } from "./client";
import { settings, projects, tasks } from "./schema";

async function seed() {
  const db = getDatabase();

  console.log("🌱 Seeding database...");

  // Create default settings if they don't exist
  const existingSettings = await db.select().from(settings).limit(1);

  if (existingSettings.length === 0) {
    await db.insert(settings).values({
      updatedAt: new Date(),
      // All other fields use schema defaults
    });
    console.log("✓ Created default settings");
  } else {
    console.log("✓ Settings already exist");
  }

  // Optional: Create sample projects
  const existingProjects = await db.select().from(projects);

  if (existingProjects.length === 0) {
    await db.insert(projects).values([
      { name: "Personal", colorHex: "#3b82f6", sortOrder: 1 }, // blue
      { name: "Work", colorHex: "#10b981", sortOrder: 2 }, // green
      { name: "Learning", colorHex: "#8b5cf6", sortOrder: 3 }, // purple
    ]);
    console.log("✓ Created sample projects");
  } else {
    console.log("✓ Projects already exist");
  }

  // Optional: Create sample tasks
  const existingTasks = await db.select().from(tasks);

  if (existingTasks.length === 0) {
    const projectList = await db.select().from(projects);
    const personalProject = projectList.find((p) => p.name === "Personal");

    await db.insert(tasks).values([
      {
        title: "Welcome to Toodle! 🎉",
        projectId: personalProject?.id,
        priority: "medium",
        bucket: "todo",
        star: true,
        heat: 0.7,
        importanceV1: 6,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: "Explore the Todo bucket",
        projectId: personalProject?.id,
        priority: "medium",
        bucket: "todo",
        heat: 0.5,
        importanceV1: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    console.log("✓ Created sample tasks");
  } else {
    console.log("✓ Tasks already exist");
  }

  console.log("🎉 Database seeding complete!");
}

// Run seed if this file is executed directly
if (require.main === module) {
  seed()
    .then(() => {
      console.log("✓ Seeding successful");
      process.exit(0);
    })
    .catch((error) => {
      console.error("✗ Seeding failed:", error);
      process.exit(1);
    });
}

export { seed };
