import type { Metadata, Viewport } from "next";
import { Fraunces, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { CurrencyProvider } from "@/lib/currency";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

// Aplica el tema guardado ANTES de la primera pintura — sin esto, la página
// siempre nace en modo oscuro (el default del <body>) y recién cambia a
// claro cuando React hidrata, provocando un parpadeo visible en cada carga.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("apu_gestion_theme");
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
} catch (e) {}
`;

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  weight: "variable",
  style: ["normal", "italic"],
});

const archivo = Archivo({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Apu Gestión — Sistema operativo del hotel",
  description: "Control de cuartos, limpieza y frigobar en tiempo real",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Apu Gestión",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14110d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink text-parchment font-ui">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ServiceWorkerRegister />
        <ThemeProvider>
          <ToastProvider>
            <CurrencyProvider>
              <AuthProvider>{children}</AuthProvider>
            </CurrencyProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
