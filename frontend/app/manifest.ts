import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Apu Gestión — Sistema operativo del hotel",
    short_name: "Apu Gestión",
    description: "Control de cuartos, limpieza y frigobar en tiempo real",
    start_url: "/",
    display: "standalone",
    background_color: "#14110d",
    theme_color: "#14110d",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
