import { RoleGuard } from "@/components/RoleGuard";

export default function CleaningLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard role="cleaning">{children}</RoleGuard>;
}
