import { connection } from "next/server";
import { AppSchil } from "@/components/app-schil";
import { heeftDatabase, huidigeTenant } from "@/lib/gegevens";

async function kantoornaam(): Promise<string> {
  // Straks uit de sessie van de ingelogde medewerker (issue #5); nu de vaste pilot-tenant.
  await connection();
  if (!heeftDatabase()) return "C&R Makelaars";
  try {
    return (await huidigeTenant()).naam;
  } catch {
    return "Kantoor onbekend";
  }
}

export default async function PortaalLayout({ children }: { children: React.ReactNode }) {
  return <AppSchil kantoor={await kantoornaam()}>{children}</AppSchil>;
}
