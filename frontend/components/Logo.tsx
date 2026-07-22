"use client";

import Image from "next/image";
import { useTheme } from "@/lib/theme";

// Proporción intrínseca del archivo de marca (1779x1031 ≈ 1.73:1).
const ASPECT_WIDTH = 178;
const ASPECT_HEIGHT = 103;

export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  // logo-white.png (trazo claro) solo se lee sobre el fondo oscuro; en modo
  // claro se vuelve casi invisible, así que ahí se usa logo.png (verde
  // salvia + tostado, la versión a color de la marca).
  const { theme } = useTheme();
  return (
    <Image
      src={theme === "light" ? "/logo.png" : "/logo-white.png"}
      alt="Apu Garden Lodge"
      width={ASPECT_WIDTH}
      height={ASPECT_HEIGHT}
      priority
      className={className}
    />
  );
}
