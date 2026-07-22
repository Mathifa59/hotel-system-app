"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-warm text-parchment-dim transition hover:border-brass/40 hover:text-brass"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M12 3a9 9 0 1 0 9 9c0-.4-.02-.8-.07-1.2a6.5 6.5 0 0 1-8.73-8.73C11.8 3.02 11.4 3 12 3Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M12 4.5V2m0 20v-2.5M4.5 12H2m20 0h-2.5M6.3 6.3 4.6 4.6m14.8 14.8-1.7-1.7M6.3 17.7l-1.7 1.7M19.4 4.6l-1.7 1.7M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
        </svg>
      )}
    </button>
  );
}
