import { AppSchil } from "@/components/app-schil";

export default function PortaalLayout({ children }: { children: React.ReactNode }) {
  // De kantoornaam komt straks uit de sessie van de ingelogde medewerker (issue #5).
  return <AppSchil kantoor="C&R Makelaars">{children}</AppSchil>;
}
