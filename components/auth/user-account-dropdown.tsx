"use client";

import { useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { User, Settings, LogOut, CheckCheck } from "lucide-react";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { useSettingsQuery } from "@/lib/queries/use-settings-query";
import { toast } from "sonner";
import type { Task } from "@/types";

export function UserAccountDropdown() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTouchingAll, setIsTouchingAll] = useState(false);
  const { data: settings = null } = useSettingsQuery();
  const queryClient = useQueryClient();

  const normalizeToDate = (value: Task["createdAt"] | string | number | null | undefined) => {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "number") {
      const milliseconds = value < 1e12 ? value * 1000 : value;
      return new Date(milliseconds);
    }

    if (typeof value === "string" && value.length > 0) {
      return new Date(value);
    }

    return new Date();
  };

  const handleTouchAll = async () => {
    setIsTouchingAll(true);

    const previousTasks = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });

    queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
      if (!oldTasks || !Array.isArray(oldTasks) || oldTasks.length === 0) {
        return oldTasks;
      }

      let hasChanges = false;

      const updatedTasks = oldTasks.map((task): Task => {
        if (task.lastTouchedAt || task.lastHeatTouchedAt) {
          return task;
        }

        hasChanges = true;
        const createdAtDate = normalizeToDate(task.createdAt);

        return {
          ...task,
          lastTouchedAt: createdAtDate,
          lastHeatTouchedAt: createdAtDate,
        };
      });

      return hasChanges ? updatedTasks : oldTasks;
    });

    try {
      const response = await fetch("/api/tasks/touch-all", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to touch all tasks");
      }

      const data = await response.json();
      toast.success(data.message || "All tasks marked as touched");

      // Ensure server state eventually matches optimistic cache
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.error("Error touching all tasks:", error);
      previousTasks.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error("Failed to mark tasks as touched");
    } finally {
      setIsTouchingAll(false);
    }
  };

  if (!isLoaded) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <User className="h-5 w-5" />
      </Button>
    );
  }

  if (!user) {
    return null;
  }

  const userInitials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || "U";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.imageUrl} alt={user.fullName || "User"} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.fullName || "User"}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/profile")}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTouchAll} disabled={isTouchingAll}>
            <CheckCheck className="mr-2 h-4 w-4" />
            <span>{isTouchingAll ? "Touching..." : "Touch All"}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ redirectUrl: "/" })}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SettingsDrawer
        initialSettings={settings}
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        hideTrigger={true}
      />
    </>
  );
}
