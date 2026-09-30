// Sessies: een versleutelde cookie van acht uur met het gebruiker-id en de tenant (ADR-009). Bij elke pagina wordt in de
// database gecontroleerd of de gebruiker nog toegang heeft, zodat intrekken direct werkt.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EncryptJWT, jwtDecrypt } from "jose";
import { zoekGebruikerOpId } from "@makelaarscockpit/db";
import { beoordeelInlog, type Rol } from "@makelaarscockpit/domain";
import { db, heeftDatabase } from "../gegevens-basis";

export const SESSIE_COOKIE = "mc_sessie";
const GELDIG_SECONDEN = 8 * 60 * 60;

export type Sessie = { gebruikerId: string; tenantId: string; rol: Rol; naam: string; kantoornaam: string };

export function sleutel(): Uint8Array {
  const waarde = process.env.SESSIE_SLEUTEL;
  if (!waarde) throw new Error("SESSIE_SLEUTEL ontbreekt");
  const bytes = Buffer.from(waarde, "base64url");
  if (bytes.length !== 32) throw new Error("SESSIE_SLEUTEL moet 32 bytes zijn (base64url)");
  return bytes;
}

export function vandaagInNederland(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const cookieOpties = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export async function startSessie(gebruiker: { id: string; tenantId: string }): Promise<void> {
  const token = await new EncryptJWT({ gid: gebruiker.id, tid: gebruiker.tenantId })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${GELDIG_SECONDEN}s`)
    .encrypt(sleutel());
  (await cookies()).set(SESSIE_COOKIE, token, { ...cookieOpties, maxAge: GELDIG_SECONDEN });
}

export async function stopSessie(): Promise<void> {
  (await cookies()).delete(SESSIE_COOKIE);
}

async function leesCookie(): Promise<{ gebruikerId: string; tenantId: string } | null> {
  const token = (await cookies()).get(SESSIE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, sleutel());
    return typeof payload.gid === "string" && typeof payload.tid === "string" ? { gebruikerId: payload.gid, tenantId: payload.tid } : null;
  } catch {
    return null;
  }
}

/**
 * De sessie van de ingelogde medewerker, of een doorverwijzing naar het inlogscherm. Eén keer per aanvraag.
 * Zonder database (lokaal ontwikkelen met voorbeeldcijfers) is er niets te beschermen en geldt een voorbeeldsessie.
 */
export const vereisSessie = cache(async (): Promise<Sessie> => {
  if (!heeftDatabase()) return { gebruikerId: "lokaal", tenantId: "lokaal", rol: "kantoorbeheerder", naam: "Lokale ontwikkelaar", kantoornaam: "Voorbeeldkantoor" };
  const cookie = await leesCookie();
  if (!cookie) redirect("/inloggen");
  const gebruiker = await zoekGebruikerOpId(db(), cookie.gebruikerId);
  // Ook controleren dat de tenant in de cookie nog klopt met de gebruiker: de cookie is nooit de bron van waarheid.
  const oordeel = beoordeelInlog(gebruiker, { methode: "email" }, vandaagInNederland());
  if (!gebruiker || !oordeel.toegestaan || gebruiker.tenantId !== cookie.tenantId) redirect("/uitloggen?melding=verlopen");
  return { gebruikerId: gebruiker.id, tenantId: gebruiker.tenantId, rol: gebruiker.rol, naam: gebruiker.naam ?? gebruiker.email, kantoornaam: gebruiker.kantoornaam };
});
