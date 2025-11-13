"use client";

import { Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const themes = [
  { id: "light", name: "Light", colors: { bg: "#ffffff", fg: "#1a1a1a" } },
  { id: "dark", name: "Dark", colors: { bg: "#383838", fg: "#f2f2f2" } },
  { id: "theme-toast", name: "Toast", colors: { bg: "#c4c9cc", fg: "#f24c05" } },
  { id: "theme-lavender", name: "Lavender", colors: { bg: "#b37447", fg: "#c3c8e3" } },
  { id: "theme-mint", name: "Mint", colors: { bg: "#f5c951", fg: "#84adb8" } },
  { id: "theme-sage", name: "Sage", colors: { bg: "#26422a", fg: "#d5ebe9" } },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" disabled>
        <Palette className="h-4 w-4" />
      </Button>
    );
  }

  const handleThemeSelect = (themeId: string) => {
    setTheme(themeId);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="cursor-pointer">
          <Palette className="h-4 w-4" />
          <span className="sr-only">Select theme</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Theme</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-4">
          {themes.map((themeOption) => (
            <button
              key={themeOption.id}
              onClick={() => handleThemeSelect(themeOption.id)}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all cursor-pointer hover:scale-105 ${
                theme === themeOption.id
                  ? "border-primary ring-2 ring-primary ring-offset-2"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex gap-2 w-full h-12 rounded overflow-hidden">
                <div
                  className="flex-1"
                  style={{ backgroundColor: themeOption.colors.bg }}
                />
                <div
                  className="flex-1"
                  style={{ backgroundColor: themeOption.colors.fg }}
                />
              </div>
              <span className="text-sm font-medium">{themeOption.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
