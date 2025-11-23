"use client";

import { useCallback } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Palette, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const router = useRouter();

  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  const handleManageAccount = useCallback(() => {
    if (openUserProfile) {
      openUserProfile();
      return;
    }
    router.push("/profile");
  }, [openUserProfile, router]);

  const handleSignOut = useCallback(async () => {
    await signOut({ redirectUrl: "/" });
  }, [signOut]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-0">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={handleBack}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage appearance and account preferences for Toasty Task.
            </p>
          </div>
        </div>
        <div className="hidden sm:inline-flex">
          <ThemeToggle />
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Palette className="h-5 w-5" />
                <span>Appearance</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Theme controls live here on mobile. On larger screens the toggle stays in the header.
              </p>
            </div>
            <div className="sm:hidden">
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <User className="h-5 w-5" />
            <span>Account</span>
          </div>

          <div className="mt-4 space-y-2">
            {isLoaded && user ? (
              <>
                <p className="text-base font-medium">{user.fullName || "Signed in user"}</p>
                {primaryEmail && <p className="text-sm text-muted-foreground">{primaryEmail}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading account...</p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleManageAccount}>
              Manage account
            </Button>
            <Button variant="destructive" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
