import { magKantoorBeheren } from "@makelaarscockpit/domain";
import { AppSchil } from "@/components/app-schil";
import { vereisSessie } from "@/lib/inlog/sessie";

export default async function PortaalLayout({ children }: { children: React.ReactNode }) {
  // Zonder geldige sessie stuurt vereisSessie door naar het inlogscherm.
  const sessie = await vereisSessie();
  return (
    <AppSchil kantoor={sessie.kantoornaam} gebruiker={sessie.naam} beheerder={magKantoorBeheren(sessie.rol)}>
      {children}
    </AppSchil>
  );
}
