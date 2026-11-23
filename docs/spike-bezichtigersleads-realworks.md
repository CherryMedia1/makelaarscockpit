# Spike: bezichtigingen en toestemming in Realworks (bezichtigersleads, stap 0)

Datum: 2026-11-09 · Status: **ronde 1 uitgevoerd, ronde 2 en de portal staan nog open**. Het leadoverzicht (issue #48, ADR-019) is op ronde 1 gebouwd. Ronde 1 draaide in de toolbox vanaf het vaste IP met de tokens van C&R (tenant `cr`, vrijgave Relaties niveau Plus). De documentatie in de developer-portal zit achter een inlog en is nog niet nagelopen.

Bronnen: de uitvoer van ronde 1 (alleen veldnamen, types en aantallen), ADR-005, ADR-011, ADR-012 en `packages/realworks/src/index.ts`.

## Kernvraag

**Ja, een bezichtiging is aan een relatie gekoppeld.** Alle 2.960 agendapunten met "bezicht" in het type hebben precies één relatie van het type `Id van de gekoppelde relatie`. Op 2.929 daarvan (99%) staat ook een `project.projectcode`, die het object aanwijst. Het ontwerp kan dus uitgaan van "bezichtiging = agendapunt + relatie + object".

In ronde 1 is wel het aantal gekoppelde relaties per punt geteld, maar niet of hun id gevuld is. Ronde 2 controleert dat per type.

## Uitkomst per vraag

### 1. Agenda API: bezichtiger en object bij een bezichtiging

Bezichtigingstypes bij C&R (uit `GET /agenda/v3/types/935773` en de agenda zelf):

| `agendatype` | Aantal | In de typelijst | Lead voor ons? (voorstel) |
|---|---|---|---|
| 1e bezichtiging | 2.663 | ja | ja |
| 2e bezichtiging | 135 | ja | ja, sterker signaal |
| Bezichtiging (planner) | 91 | **nee**, komt uit de planner | ja |
| Bezichtigingsblok (planner) | 39 | **nee** | waarschijnlijk niet: een tijdblok, geen bezoeker; ronde 2 |
| Aankoop bezichtiging (incl. makelaar) | 30 | ja | nee: onze aankoopklant bezichtigt elders; open vraag C&R |
| Aankoop bezichtiging (excl. makelaar) | 1 | ja | idem |
| Huur bezichtiging | 1 | ja | open vraag C&R |
| Open Huis | 282 | ja | niet meegeteld (geen "bezicht" in de naam); ronde 2 kijkt of er een relatie aan hangt |

Velden van een bezichtigingspunt:

| Veld | Aanwezig | Voorbeeldstructuur (zonder persoonsgegevens) | Opmerking |
|---|---|---|---|
| `id` | ja | `123` | Realworks-id, sleutel voor idempotentie |
| `agendatype` | ja | `"1e bezichtiging"` | zie de tabel hierboven |
| `status` | ja | `"Definitief"` (2.944), `"Wacht op bevestiging"` (16) | geen `Geannuleerd` gezien: een geannuleerde bezichtiging verdwijnt waarschijnlijk uit de lijst; de reconciliatie moet verdwijnen afhandelen |
| `begintijd`, `eindtijd`, `afspraakGeheleDag` | ja | `"2026-01-12 16:00:00"` | |
| `project.projectcode`, `project.type` | ja (2.929 van 2.960) | `{ "projectcode": "…", "type": "WONEN" }` | `WONEN` 2.925, `NIEUWBOUW` 2, leeg 33 |
| `relaties[]` | ja, altijd precies 3 | `[{ "id": 1, "type": "Id van de gekoppelde relatie" }, { "id": 2, "type": "Agendapunt voor" }, { "id": 3, "type": "Geplaatst door (medewerker)" }]` | **één bezichtiger per punt**; een partner is geen aparte relatie |
| `vrijgegevenMove` | ja | boolean (aanname) | waarschijnlijk zichtbaar voor de koper in Move; verdeling in ronde 2 |
| `invoerdatum`, `tijdstipLaatsteWijziging` | ja | `"2026-01-12 16:00:00"` | voor reconciliatie |
| `agendacode`, `bedrijfscode`, `bedrijfsrelatiecode`, `locatie`, `popupHerinnering` | ja | | `locatie` is het adres van het object |
| `korteOmschrijving`, `extraInfo` | ja | vrije tekst | **nooit opslaan of loggen**: kan namen en notities bevatten |

### 2. Move.nl-bezichtigingsplanner

| Vraag | Antwoord |
|---|---|
| Komen planner-bezichtigingen in de Agenda API? | **ja**, als `Bezichtiging (planner)` (91) en `Bezichtigingsblok (planner)` (39). Deze types staan niet in de typelijst van het kantoor. |
| Is de koper een gekoppelde relatie? | ja, er staat er altijd één. Of de planner een nieuwe relatie aanmaakt, is nog onbekend (vraag aan Realworks). |
| Is de bron herkenbaar? | ja, aan het `agendatype` |

### 3. Mailing, marketingvrijgave en toestemming via de Relatie API

Bekeken op één relatie, vrijgave Plus; ronde 2 bekijkt er 25.

| Veld | Aanwezig | Voorbeeld | Opmerking |
|---|---|---|---|
| `overige.geenMailing` | **ja** | `false` | mailingvlag van Realworks; leesbaar |
| `overige.mailingUitschrijfLink` | **ja** | string (URL) | Realworks heeft een eigen uitschrijflink per relatie |
| marketingvrijgave (Gegeven / Ingetrokken / Wacht) | **nee** | | niet in het antwoord bij niveau Plus; navragen of het bij een ander niveau of endpoint zit |
| toestemming per kanaal (bellen, advertenties) | **nee** | | moeten wij zelf vastleggen |
| `kenmerken[].id` | ja | `[{ "id": 1 }]` | C&R kan toestemming als kenmerk bijhouden; ronde 2 zoekt kenmerken met "toestemming", "AVG", "marketing" en dergelijke |
| schrijfbaar | onbekend | | schema van `PUT /relaties/v1` in de portal bekijken |
| overige velden | ja | | naam, adressen (ook toekomstig adres), e-mailadressen, telefoonnummers met type, geslacht, accountmanager, relatiesoort/-type |

Het detail werkte met een van beide bedrijfscodes (935585 of 935773); ronde 2 laat zien welke.

### 4. Webhooks

| Webhook | Bekend | Opmerking |
|---|---|---|
| Wonen, Object update | ja | klaargezet in de handleiding (§6), nog niet geregistreerd |
| Wonen, statusupdate | onbekend | portal |
| Agenda | **onbekend** | portal; zonder Agenda-webhook komen bezichtigingen alleen via de reconciliatie binnen |
| Relaties | **onbekend** | portal; nodig om `geenMailing` snel te zien |
| `userAccess: INACTIVE` | **in deze repo een Plaud-signaal** (ADR-015 §4) | navragen of Realworks iets vergelijkbaars stuurt; anders randvoorwaarde 3 herformuleren |

### Gevolgen voor het ontwerp (voorlopig)

- De bezichtiger is de gekoppelde relatie, en de woning is het object via de projectcode. Per punt is er één bezichtiger.
- De bezichtigingstypes horen in een tenantinstelling, niet in de code: C&R heeft eigen namen, en de planner-types staan niet in de typelijst.
- Realworks levert geen toestemming per kanaal. De toestemmingen komen dus uit ons eigen formulier en worden in MakelaarsCockPit vastgelegd. `geenMailing = true` blokkeert mailing altijd, ook als iemand bij ons toestemming gaf.
- `korteOmschrijving` en `extraInfo` worden niet bewaard, net als nu bij waardebepalingen.
- Omdat geannuleerde bezichtigingen waarschijnlijk uit de lijst verdwijnen, moet de reconciliatie verdwenen punten verwijderen.

### Andere afwijkingen tussen de opdracht en de repo

- **730 dagen terug**: volgens de handleiding (§5) staat de vrijgave Agenda op 365 dagen terug. Ronde 2 toont de werkelijke periode.
- **"Bestaande uurlijkse reconciliatie"**: `sync-realworks` draait volgens ADR-008 dagelijks of handmatig. Elke run leest de hele agenda (circa 12.700 punten).
- **ADR-012 §4 sluit bezichtigingen en klantgegevens uit de agendaspiegel uit.** Dit vraagt een ADR die dat aanvult.

## Ronde 1 (uitgevoerd 2026-11-09)

`rw` print de eerste 800 tekens van een antwoord, en daar staan persoonsgegevens in. Gebruik daarom de scripts hieronder: ze tonen alleen veldnamen, types en aantallen. Bij velden met marketing, mailing of vrijgave in de naam tonen ze ook de waarde, maar alleen als het een korte enum of boolean is. Starten met `infra/scripts/dev-aan.sh`, dan `infra/scripts/toolbox.sh`, of via Cloud Shell (zie de handleiding). Plak in de toolbox-shell:

```bash
az account show -o none 2>/dev/null || az login --identity --client-id "$AZURE_CLIENT_ID" -o none
kv() { az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$1" --query value -o tsv; }
export RW_AGENDA=$(kv tenant-cr-realworks-token-agenda) RW_REL=$(kv tenant-cr-realworks-token-relaties)
python3 - <<'PY'
import json, os, re, urllib.request, collections
def get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "rwauth " + token, "Accept": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))
def paden(o, pre=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from paden(v, f"{pre}.{k}" if pre else k)
    elif isinstance(o, list):
        for v in o[:3]: yield from paden(v, pre + "[]")
    else: yield pre, type(o).__name__
B = "https://api.realworks.nl"
# Referentiedata zonder persoonsgegevens; kan een lijst zijn of een object met "resultaten".
types = get(f"{B}/agenda/v3/types/935773", os.environ["RW_AGENDA"])
types = types.get("resultaten", types) if isinstance(types, dict) else types
print("types:", [t.get("omschrijving") or t.get("naam") or t if isinstance(t, dict) else t for t in types] if isinstance(types, list) else types)
url, per_type, bez = f"{B}/agenda/v3/afdeling/935773?aantal=100", collections.Counter(), []
while url:
    d = get(url, os.environ["RW_AGENDA"]); url = (d.get("paginering") or {}).get("volgende")
    for a in d["resultaten"]:
        per_type[a.get("agendatype")] += 1
        if re.search("bezicht", a.get("agendatype") or "", re.I): bez.append(a)
print("agendapunten per type:", dict(per_type))
print("bezichtigingen:", len(bez))
print("met projectcode:", sum(1 for a in bez if (a.get("project") or {}).get("projectcode")))
print("project.type:", dict(collections.Counter((a.get("project") or {}).get("type") for a in bez)))
print("status:", dict(collections.Counter(a.get("status") for a in bez)))
print("relatie-types (aantal per punt):", dict(collections.Counter(tuple(sorted(collections.Counter(r.get("type") for r in a.get("relaties") or []).items())) for a in bez)))
print("veldpaden bezichtiging:", sorted(set(p for a in bez[:50] for p, _ in paden(a))))
rid = next((r["id"] for a in bez for r in a.get("relaties") or [] if r.get("type") == "Id van de gekoppelde relatie" and r.get("id")), None)
if rid:
    # ADR-005 noemt bedrijfscode 935585, het runbook testte het detail met 935773: probeer beide.
    try: rel = get(f"{B}/relaties/v1/{rid}?bedrijfscode=935585", os.environ["RW_REL"])
    except Exception: rel = get(f"{B}/relaties/v1/{rid}?bedrijfscode=935773", os.environ["RW_REL"])
    print("veldpaden relatie:", sorted(set(p for p, _ in paden(rel))))
    for p, _ in paden(rel):
        if re.search("marketing|mailing|vrijgave|nieuwsbrief|toestemming|optin|opt_in", p, re.I):
            v = rel
            for k in p.replace("[]", "").split("."): v = v.get(k) if isinstance(v, dict) else (v[0].get(k) if isinstance(v, list) and v and isinstance(v[0], dict) else None)
            print("  ", p, "=", v if isinstance(v, bool) or (isinstance(v, str) and len(v) <= 20) else type(v).__name__)
PY
unset RW_AGENDA RW_REL
```

## Ronde 2 (nog te doen)

Per type: of de relatie-id gevuld is, hoeveel unieke bezichtigers, de verdeling van `vrijgegevenMove` en de periode die de vrijgave toelaat. Verder: of de gekoppelde relatie soms een medewerker is (bij blokken), hoe vaak iemand terugkomt, welke velden 25 relaties wel of niet hebben, `geenMailing` over die 25, en welke kenmerken over toestemming gaan. Zelfde toolbox-sessie; plak in één keer:

```bash
az account show -o none 2>/dev/null || az login --identity --client-id "$AZURE_CLIENT_ID" -o none
kv() { az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$1" --query value -o tsv; }
export RW_AGENDA=$(kv tenant-cr-realworks-token-agenda) RW_REL=$(kv tenant-cr-realworks-token-relaties)
python3 - <<'PY'
import json, os, re, urllib.request, collections
C = collections.Counter
def get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "rwauth " + token, "Accept": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))
def lijst(d): return d.get("resultaten", d) if isinstance(d, dict) else d
def paden(o, pre=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from paden(v, f"{pre}.{k}" if pre else k)
    elif isinstance(o, list):
        for v in o[:3]: yield from paden(v, pre + "[]")
    else: yield pre
def rel_get(pad):
    for code in ("935585", "935773"):
        try: return code, get(f"{B}{pad}{'&' if '?' in pad else '?'}bedrijfscode={code}", os.environ["RW_REL"])
        except Exception: pass
    return None, None
B = "https://api.realworks.nl"
url, bez = f"{B}/agenda/v3/afdeling/935773?aantal=100", []
while url:
    d = get(url, os.environ["RW_AGENDA"]); url = (d.get("paginering") or {}).get("volgende")
    bez += [a for a in d["resultaten"] if re.search("bezicht|open huis", a.get("agendatype") or "", re.I)]
def rid(a): return next((r.get("id") for r in a.get("relaties") or [] if r.get("type") == "Id van de gekoppelde relatie"), None)
med = {m.get("id") for m in lijst(get(f"{B}/relaties/v1/medewerker?aantal=100", os.environ["RW_REL"]))}
per = collections.defaultdict(list)
for a in bez: per[a.get("agendatype")].append(a)
for t, pp in sorted(per.items()):
    tijden = sorted(a["begintijd"] for a in pp if a.get("begintijd"))
    ids = [rid(a) for a in pp if rid(a)]
    print(f"{t}: {len(pp)} punten; relatie-id gevuld {len(ids)}; uniek {len(set(ids))}; is medewerker {sum(1 for i in ids if i in med)}; "
          f"projectcode {sum(1 for a in pp if (a.get('project') or {}).get('projectcode'))}; vrijgegevenMove {dict(C(a.get('vrijgegevenMove') for a in pp))}; "
          f"periode {tijden[0][:10] if tijden else '-'} t/m {tijden[-1][:10] if tijden else '-'}")
leads = [a for a in bez if re.search("^(1e|2e) bezichtiging$|^Bezichtiging \\(planner\\)$", a.get("agendatype") or "") and rid(a) and rid(a) not in med]
per_rel = C(rid(a) for a in leads)
print("bezichtigers (1e/2e/planner):", len(per_rel), "; aantal met n bezichtigingen:", dict(sorted(C(per_rel.values()).items())))
code, kenm = rel_get("/relaties/v1/kenmerken")
kenm = {k.get("id"): k for k in lijst(kenm) or [] if isinstance(k, dict)}
print("bedrijfscode die werkt:", code, "; kenmerkgroepen:", sorted({str(k.get("groep")) for k in kenm.values()}))
relevant = {i: k for i, k in kenm.items() if re.search("toestem|avg|marketing|mailing|nieuwsbrief|bellen|privacy|opt|vrijgave", f"{k.get('groep')} {k.get('omschrijving')}", re.I)}
print("kenmerken over toestemming:", [(k.get("groep"), k.get("omschrijving")) for k in relevant.values()])
recent = sorted(leads, key=lambda a: a.get("begintijd") or "", reverse=True)
steekproef = list(dict.fromkeys(rid(a) for a in recent))[:25]
veld, mailing, soort, kenm_tel = C(), C(), C(), C()
for i in steekproef:
    _, r = rel_get(f"/relaties/v1/{i}")
    if not r: continue
    veld.update(set(paden(r))); mailing[(r.get("overige") or {}).get("geenMailing")] += 1
    soort[(r.get("relatiesoort"), r.get("relatietype"))] += 1
    kenm_tel.update(k.get("id") for k in r.get("kenmerken") or [] if k.get("id") in relevant)
n = len(steekproef)
print(f"steekproef {n} relaties; velden niet bij iedereen:", {p: c for p, c in sorted(veld.items()) if c < n})
print("geenMailing:", dict(mailing), "; relatiesoort/-type:", dict(soort))
print("toestemmingskenmerken in steekproef:", {f"{relevant[i].get('groep')}/{relevant[i].get('omschrijving')}": c for i, c in kenm_tel.items()})
PY
unset RW_AGENDA RW_REL
```

Daarna in de portal (ingelogd):
- Agenda: het endpoint voor één agendapunt (Try it out). Geeft het detail meer velden dan de lijst?
- Relaties: het schema van `PUT /relaties/v1`. Staan `geenMailing` of een marketingvrijgave erin?
- Webhooks: de lijst van object types en update types.

## Vragen aan Realworks (te versturen)

1. De bezichtigingsplanner maakt agendapunten van het type "Bezichtiging (planner)" met een gekoppelde relatie. Wordt die relatie nieuw aangemaakt als de koper nog niet bekend is? En wat is een "Bezichtigingsblok (planner)"?
2. Verdwijnt een geannuleerde bezichtiging uit de Agenda API, of krijgt ze de status Geannuleerd?
3. Is de AVG-marketingvrijgave van een relatie leesbaar via de Relatie API (welk niveau of endpoint)? En zijn `geenMailing` en de vrijgave schrijfbaar via `PUT /relaties/v1`?
4. Welke webhooks zijn er voor Agenda en Relaties, en is er een signaal wanneer een kantoor de koppeling of de vrijgave intrekt?
