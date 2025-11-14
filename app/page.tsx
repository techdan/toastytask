import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

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
          <div className="mb-4 flex items-center justify-center gap-3">
            <Logo width={60} height={60} className="h-15 w-15" />
            <h1 className="font-fraunces text-5xl font-bold tracking-tight logo-text">
              <span className="logo-word-toasty">Toasty</span>
              <span className="logo-word-task">Task</span>
            </h1>
          </div>
        <p className="mb-8 text-xl text-muted-foreground">
          Your tasks rise to the top when they matter.
        </p>
        <p className="mb-12 text-lg text-muted-foreground">
          Automatically surfaces hot work with minimal upkeep.
          <br />
          Features importance-based scoring for effortless task management.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/sign-up">
            <Button size="lg" className="text-lg cursor-pointer">
              Get Started
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" className="text-lg cursor-pointer">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
