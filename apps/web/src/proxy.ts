import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Tijdelijke afscherming van de pilot-omgeving tot de echte inlog er is (issue #5, ADR-006).
// Staat alleen aan als PILOT_WACHTWOORD is gezet; de waarde komt uit Key Vault, nooit uit code.
export function proxy(request: NextRequest) {
  const wachtwoord = process.env.PILOT_WACHTWOORD;
  if (!wachtwoord) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const [schema, waarde] = header.split(" ");
  if (schema === "Basic" && waarde) {
    const gedecodeerd = Buffer.from(waarde, "base64").toString("utf8");
    const opgegeven = gedecodeerd.slice(gedecodeerd.indexOf(":") + 1);
    if (opgegeven === wachtwoord) return NextResponse.next();
  }
  return new NextResponse("Inloggen vereist.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MakelaarsCockpit pilot", charset="UTF-8"' },
  });
}

export const config = {
  // Alles behalve de health-check voor de container, statische bestanden en de merkbestanden (logo's zijn niet vertrouwelijk,
  // en de afbeeldingsverwerking van Next.js haalt ze intern op zonder inloggegevens).
  matcher: ["/((?!api/health|_next/static|_next/image|brand/|favicon.ico|icon.svg|apple-icon.png).*)"],
};
