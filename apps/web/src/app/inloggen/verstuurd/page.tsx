import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

export const metadata: Metadata = { title: "Kijk in je mailbox" };

export default function Verstuurd() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <MailCheck aria-hidden size={24} strokeWidth={1.75} />
      </span>
      <h1 className="text-h3">Kijk in je mailbox</h1>
      <p className="text-body text-text-muted">
        Als dit adres bij een kantoor bekend is, staat er binnen een minuut een inloglink in je mailbox. De link is 15 minuten geldig.
      </p>
      <Link href="/inloggen" className="text-label text-primary hover:underline">
        Terug naar inloggen
      </Link>
    </div>
  );
}
