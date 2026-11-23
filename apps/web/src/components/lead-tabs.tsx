import Link from "next/link";
import { knopKlassen } from "./basis";

/** Wisselt tussen de lijst met leads en het pijplijnbord. */
export function LeadTabs({ actief }: { actief: "overzicht" | "bord" }) {
  return (
    <div className="flex gap-2" role="tablist" aria-label="Weergave">
      <Link href="/leads" role="tab" aria-selected={actief === "overzicht"} className={knopKlassen(actief === "overzicht" ? "secundair" : "ghost")}>Overzicht</Link>
      <Link href="/leads/pijplijn" role="tab" aria-selected={actief === "bord"} className={knopKlassen(actief === "bord" ? "secundair" : "ghost")}>Pijplijnbord</Link>
    </div>
  );
}
