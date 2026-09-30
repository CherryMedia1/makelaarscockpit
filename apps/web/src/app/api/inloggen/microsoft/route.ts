import { NextResponse } from "next/server";
import { microsoftBeschikbaar, startMicrosoftInlog } from "@/lib/inlog/microsoft";

export async function GET() {
  const basis = process.env.PORTAAL_URL ?? "http://localhost:3000";
  if (!microsoftBeschikbaar()) return NextResponse.redirect(`${basis}/inloggen?melding=storing`);
  return NextResponse.redirect(await startMicrosoftInlog());
}
