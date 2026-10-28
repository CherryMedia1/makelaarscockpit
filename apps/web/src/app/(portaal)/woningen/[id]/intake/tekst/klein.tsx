"use client";

// Kleine clientonderdelen van de tekstpagina: verversen zolang het model schrijft, en kopiëren naar het klembord.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { knopKlassen } from "@/components/basis";

/** Ververst de pagina elke paar seconden, zolang de tekst op "bezig" staat. */
export function Verversen({ elkeMs = 5_000 }: { elkeMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), elkeMs);
    return () => clearInterval(timer);
  }, [router, elkeMs]);
  return null;
}

export function KopieerKnop({ tekst }: { tekst: string }) {
  const [gekopieerd, zetGekopieerd] = useState(false);
  return (
    <button
      type="button"
      className={knopKlassen("primair")}
      onClick={async () => {
        await navigator.clipboard.writeText(tekst);
        zetGekopieerd(true);
        setTimeout(() => zetGekopieerd(false), 2_500);
      }}
    >
      {gekopieerd ? <Check aria-hidden size={18} strokeWidth={2} /> : <Copy aria-hidden size={18} strokeWidth={2} />}
      {gekopieerd ? "Gekopieerd" : "Kopiëren"}
    </button>
  );
}
