import { UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/tasks">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Profile Settings</h1>
      </div>
      <UserProfile />
    </div>
  );
}
