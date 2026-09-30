import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Eerste, snelle controle: zonder sessie-cookie ga je naar het inlogscherm. De echte controle (geldige sessie, gebruiker
// nog actief, juiste kantoor) gebeurt bij de gegevens zelf, in lib/inlog/sessie.ts.
export function proxy(request: NextRequest) {
  // Zonder database is er lokaal niets te beschermen (voorbeeldcijfers).
  if (!process.env.PGHOST) return NextResponse.next();
  if (request.cookies.has("mc_sessie")) return NextResponse.next();
  const inloggen = request.nextUrl.clone();
  inloggen.pathname = "/inloggen";
  inloggen.search = "";
  return NextResponse.redirect(inloggen);
}

export const config = {
  // Alles behalve het inloggen zelf, de health-check, statische bestanden en de merkbestanden.
  matcher: ["/((?!inloggen|uitloggen|api/inloggen|api/health|_next/static|_next/image|brand/|favicon.ico|icon.svg|apple-icon.png).*)"],
};
