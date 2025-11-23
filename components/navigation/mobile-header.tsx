"use client";

import { type ReactNode, useMemo } from "react";
import { Menu, MoreVertical, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  onOpenProjects: () => void;
  onToggleSearch: () => void;
  onOpenOptions?: () => void;
  optionsTrigger?: ReactNode;
  isSearchActive?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  onSearchBlur?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  className?: string;
}

export function MobileHeader({
  onOpenProjects,
  onToggleSearch,
  onOpenOptions,
  optionsTrigger,
  isSearchActive = false,
  searchValue = "",
  onSearchChange,
  onSearchSubmit,
  onSearchBlur,
  searchInputRef,
  className,
}: MobileHeaderProps) {
  const handleSubmit = useMemo(() => {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSearchSubmit?.(searchValue);
    };
  }, [onSearchSubmit, searchValue]);

  return (
    <header
      className={cn(
        "sm:hidden sticky top-0 z-30 flex h-14 items-center border-b bg-background px-3 shadow-sm",
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

      <div className="relative ml-2 flex flex-1 items-center min-w-0">
        <div
          className={cn(
            "flex w-full items-center justify-between gap-3 pr-12 transition-opacity duration-150",
            isSearchActive && "opacity-0 pointer-events-none"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Logo width={28} height={28} className="h-7 w-7 flex-shrink-0" />
            <div className="font-fraunces text-xl font-bold leading-none tracking-tight whitespace-nowrap">
              <span className="logo-word-toasty">Toasty</span>{" "}
              <span className="logo-word-task">Task</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
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
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className={cn(
            "absolute inset-y-0 flex items-center gap-1 bg-background pl-2 pr-1 shadow-sm transition-all duration-200 ease-out",
            isSearchActive
              ? "left-0 right-12 translate-x-0 opacity-100 z-20"
              : "left-[calc(100%-3rem)] translate-x-2 opacity-0 pointer-events-none"
          )}
        >
          <Input
            ref={searchInputRef}
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            onBlur={onSearchBlur}
            placeholder="Search tasks and notes..."
            className="h-10 w-[min(70vw,240px)]"
            aria-label="Search tasks and notes"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label="Execute search"
            onMouseDown={(event) => event.preventDefault()}
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>

        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="absolute right-0 top-1/2 z-30 h-10 w-10 -translate-y-1/2"
          onClick={onToggleSearch}
          onMouseDown={(event) => event.preventDefault()}
          aria-label={isSearchActive ? "Close search" : "Open search"}
        >
          <Search className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
