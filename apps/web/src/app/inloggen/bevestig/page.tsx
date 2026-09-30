import type { Metadata } from "next";
import { knopKlassen } from "@/components/basis";
import { inloglinkBevestigen } from "../acties";

export const metadata: Metadata = { title: "Inloggen bevestigen" };

// De link uit de e-mail logt niet zelf in: pas de knop verbruikt het token. Zo kan een mailscanner die de link
// alvast opent de inloglink niet opmaken.
export default async function Bevestig({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return (
    <form action={inloglinkBevestigen} className="flex flex-col gap-6">
      <div>
        <h1 className="text-h3">Bijna binnen</h1>
        <p className="mt-1 text-body text-text-muted">Klik op de knop om in te loggen bij MakelaarsCockpit.</p>
      </div>
      <input type="hidden" name="token" value={token} />
      <button type="submit" className={knopKlassen("primair", true)}>
        Inloggen
      </button>
    </form>
  );
}
