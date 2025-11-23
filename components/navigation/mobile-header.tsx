"use client";

import { type ReactNode } from "react";
import { Menu, MoreVertical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  onOpenProjects: () => void;
  onOpenSearch: () => void;
  onOpenOptions?: () => void;
  optionsTrigger?: ReactNode;
  searchButtonRef?: React.RefObject<HTMLButtonElement>;
  className?: string;
}

export function MobileHeader({
  onOpenProjects,
  onOpenSearch,
  onOpenOptions,
  optionsTrigger,
  searchButtonRef,
  className,
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        "sm:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-3 shadow-sm",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={onOpenProjects}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <Logo width={28} height={28} className="h-7 w-7" />
        <div className="font-fraunces text-xl font-bold leading-none tracking-tight">
          <span className="logo-word-toasty">Toasty</span>{" "}
          <span className="logo-word-task">Task</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {optionsTrigger ?? (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={onOpenOptions}
            aria-label="Open task options"
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={onOpenSearch}
          ref={searchButtonRef}
          aria-label="Open search"
        >
          <Search className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
