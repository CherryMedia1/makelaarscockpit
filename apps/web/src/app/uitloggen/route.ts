import { NextResponse, type NextRequest } from "next/server";
import { stopSessie } from "@/lib/inlog/sessie";

// Wist de sessie als die niet meer geldig is (verlopen, ingetrokken) en stuurt door naar het inlogscherm.
export async function GET(request: NextRequest) {
  await stopSessie();
  const melding = request.nextUrl.searchParams.get("melding") === "verlopen" ? "verlopen" : "uitgelogd";
  return NextResponse.redirect(`${process.env.PORTAAL_URL ?? "http://localhost:3000"}/inloggen?melding=${melding}`);
}
