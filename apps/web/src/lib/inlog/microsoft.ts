// Inloggen met het Microsoft-account van het kantoor (OpenID Connect, autorisatiecode met PKCE). ADR-009.
// We vertrouwen het e-mailadres uit het token alleen in combinatie met de organisatie (tid): zie packages/domain/toegang.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { EncryptJWT, createRemoteJWKSet, jwtDecrypt, jwtVerify } from "jose";
import { normaliseerEmail } from "@makelaarscockpit/domain";
import { sleutel } from "./sessie";

const AUTORITEIT = "https://login.microsoftonline.com/organizations";
const SLEUTELS = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));
const OIDC_COOKIE = "mc_oidc";

function instelling(naam: string): string {
  const waarde = process.env[naam];
  if (!waarde) throw new Error(`${naam} ontbreekt`);
  return waarde;
}

export const microsoftBeschikbaar = () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
const terugUrl = () => `${instelling("PORTAAL_URL")}/api/inloggen/microsoft/terug`;
const willekeurig = () => randomBytes(32).toString("base64url");

/** Zet de controlegegevens in een kortlevende versleutelde cookie en geeft de URL van het Microsoft-inlogscherm. */
export async function startMicrosoftInlog(): Promise<string> {
  const state = willekeurig(), nonce = willekeurig(), verifier = willekeurig();
  const cookie = await new EncryptJWT({ state, nonce, verifier }).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setExpirationTime("10m").encrypt(sleutel());
  (await cookies()).set(OIDC_COOKIE, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/inloggen/microsoft", maxAge: 600 });
  const url = new URL(`${AUTORITEIT}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: instelling("MICROSOFT_CLIENT_ID"),
    response_type: "code",
    response_mode: "query",
    redirect_uri: terugUrl(),
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type MicrosoftIdentiteit = { microsoftTenantId: string; emails: string[] };

/** Wisselt de code in, controleert het token en geeft de organisatie en de mogelijke e-mailadressen van de gebruiker. */
export async function rondMicrosoftInlogAf(code: string, state: string): Promise<MicrosoftIdentiteit> {
  const jar = await cookies();
  const cookie = jar.get(OIDC_COOKIE)?.value;
  jar.delete({ name: OIDC_COOKIE, path: "/api/inloggen/microsoft" });
  if (!cookie) throw new Error("inlogpoging verlopen");
  const { payload: bewaard } = await jwtDecrypt(cookie, sleutel());
  if (bewaard.state !== state) throw new Error("state komt niet overeen");

  const antwoord = await fetch(`${AUTORITEIT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: instelling("MICROSOFT_CLIENT_ID"),
      client_secret: instelling("MICROSOFT_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: terugUrl(),
      code_verifier: String(bewaard.verifier),
    }),
  });
  if (!antwoord.ok) throw new Error(`tokenverzoek gaf status ${antwoord.status}`);
  const { id_token: idToken } = (await antwoord.json()) as { id_token?: string };
  if (!idToken) throw new Error("geen id_token ontvangen");

  const { payload } = await jwtVerify(idToken, SLEUTELS, { audience: instelling("MICROSOFT_CLIENT_ID") });
  if (payload.nonce !== bewaard.nonce) throw new Error("nonce komt niet overeen");
  const tid = typeof payload.tid === "string" ? payload.tid : "";
  if (!/^[0-9a-f-]{36}$/i.test(tid)) throw new Error("token zonder organisatie");
  // De uitgever is per organisatie verschillend; hij moet bij de organisatie uit het token zelf horen.
  if (payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new Error("uitgever hoort niet bij de organisatie");

  const emails = [payload.preferred_username, payload.email, payload.upn]
    .map((w) => (typeof w === "string" ? normaliseerEmail(w) : null))
    .filter((w): w is string => w !== null);
  return { microsoftTenantId: tid, emails: [...new Set(emails)] };
}
