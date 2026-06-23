import { RoleGuard } from "@/components/RoleGuard";

export default function ReceptionLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard role="reception">{children}</RoleGuard>;
}
