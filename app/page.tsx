import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const { userId } = await auth();

  // If user is already signed in, redirect to tasks
  if (userId) {
    redirect("/tasks");
  }

  // Show landing page for unauthenticated users
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto max-w-4xl px-4 text-center">
        <h1 className="mb-4 text-5xl font-bold">Welcome to Toodle</h1>
        <p className="mb-8 text-xl text-muted-foreground">
          Smart task management with intelligent prioritization
        </p>
        <p className="mb-12 text-lg text-muted-foreground">
          Automatically surfaces hot work and cools down cold items with minimal upkeep.
          <br />
          Features importance-based scoring and heat dynamics for effortless task management.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/sign-up">
            <Button size="lg" className="text-lg">
              Get Started
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" className="text-lg">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
