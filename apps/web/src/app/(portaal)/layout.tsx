import { magKantoorBeheren } from "@makelaarscockpit/domain";
import { AppSchil } from "@/components/app-schil";
import { intakeModuleAan } from "@/lib/intake";
import { vereisSessie } from "@/lib/inlog/sessie";

export default async function PortaalLayout({ children }: { children: React.ReactNode }) {
  // Zonder geldige sessie stuurt vereisSessie door naar het inlogscherm.
  const sessie = await vereisSessie();
  const beheerder = magKantoorBeheren(sessie.rol);
  // De module alleen opvragen als het menu-item er voor deze gebruiker toe doet.
  const intake = beheerder && (await intakeModuleAan());
  return (
    <AppSchil kantoor={sessie.kantoornaam} gebruiker={sessie.naam} beheerder={beheerder} intake={intake}>
      {children}
    </AppSchil>
  );
}
