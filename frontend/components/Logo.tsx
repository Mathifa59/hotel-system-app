import Image from "next/image";

// Proporción intrínseca del archivo de marca (1779x1031 ≈ 1.73:1).
const ASPECT_WIDTH = 178;
const ASPECT_HEIGHT = 103;

export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo-white.png"
      alt="Apu Garden Lodge"
      width={ASPECT_WIDTH}
      height={ASPECT_HEIGHT}
      priority
      className={className}
    />
  );
}
