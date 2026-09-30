# MakelaarsCockpit — Huisstijl v1.0

> Dit document is de bron van waarheid voor de visuele identiteit van MakelaarsCockpit: de webapp, de marketingwebsite, e-mails, presentaties en drukwerk. Het is geschreven zodat zowel mensen als Claude Code het direct kunnen toepassen. Tokens staan in `tokens/`, logo's in `logo/`.

## 1. Merk in het kort

MakelaarsCockpit geeft makelaarskantoren één overzicht over hun hele bedrijf: aanbod, leads, opdrachten en resultaat, bovenop Realworks. Het merk voelt **strak, modern maar warm**:

- **Strak** — rustige vlakken, duidelijke hiërarchie, veel witruimte, geen decoratie zonder functie.
- **Modern** — geometrische koppen (Sora), heldere data, directe taal.
- **Warm** — zandkleurige ondergrond in plaats van koud wit, baksteen als accent, afgeronde hoeken, menselijke toon.

Het beeldmerk combineert een **dak** (de makelaardij) met een **meter** (de cockpit): het huis als dashboard.

## 2. Logo

### Onderdelen
- **Beeldmerk (icoon):** dak + meterboog + naald. De naald is altijd de accentkleur (baksteen op licht, oker op donker).
- **Woordmerk:** `MakelaarsCockpit` in Sora, "Makelaars" Regular (400) en "Cockpit" Bold (700), aaneengeschreven met hoofdletter C. De letters zijn omgezet naar vectoren; typ het logo nooit na.

### Versies

| Bestand | Gebruik |
|---|---|
| `logo-horizontaal-kleur` | Standaard. App-header, website, e-mail, documenten op lichte achtergrond. |
| `logo-horizontaal-donker` | Op inkt of donkere foto's. Naald in oker. |
| `logo-gestapeld-*` | Vierkante of smalle ruimtes: social avatar, inlogscherm, cover. |
| `logo-*-mono-inkt` | Eenkleurig drukwerk, fax, stempels, lage kwaliteit print. |
| `logo-*-mono-wit` | Eenkleurig op foto of gekleurd vlak (petrol, baksteen). |
| `icoon-*` | Alleen het beeldmerk, als het merk al elders genoemd wordt (bijv. ingeklapte sidebar). |
| `app-icoon` | PWA/app-icoon, social profielfoto. Petrol vlak, wit icoon, oker naald. |
| `favicon.svg` / `favicon.ico` | Browsertab. Vereenvoudigde versie met dikkere lijnen. |

Alle versies bestaan als **SVG** (voorkeur, schaalbaar) en **PNG** (transparant) in meerdere breedtes.

### Vrije ruimte en minimale grootte
- **Vrije ruimte** rondom het logo = de hoogte van het dak (±0,3 × de icoonhoogte). Geen tekst, randen of beeld binnen die zone.
- **Minimale breedte** horizontaal logo: 120 px scherm / 30 mm print.
- **Minimale breedte** gestapeld logo: 80 px / 20 mm.
- **Icoon** kleiner dan 24 px: gebruik de favicon-versie (dikkere lijnen).

### Niet doen
- Het woordmerk nabouwen met een webfont of in een andere letter zetten.
- Kleuren wisselen (bijv. een petrol naald, of baksteen dak).
- Het logo uitrekken, draaien, schaduw of gloed geven, of in een kader zetten.
- Kleurlogo op een drukke foto of op baksteen/oker; gebruik dan `mono-wit`.
- De naald laten weg of anders richten: hij staat altijd rechtsboven (positief).

## 3. Kleur

### Merkkleuren

| Naam | Hex | Rol |
|---|---|---|
| Inkt | `#14202B` | Tekst, donkere vlakken, navigatie in donkere modus |
| Petrol | `#1E4D57` | **Primaire merkkleur.** Knoppen, links, actieve staten, logo |
| Baksteen | `#C4613A` | **Accent.** Naald in logo, highlights, grafiek-accent, CTA op marketing |
| Oker | `#D9A441` | Tweede accent, vooral op donker; waarschuwingen, grafieken |
| Zand | `#F5F0E8` | Achtergrond van app en website |
| Klei | `#E7DDD0` | Randen, scheidingslijnen, lege staten |
| Steen | `#5E6770` | Secundaire tekst, labels, iconen |
| Wit | `#FFFFFF` | Kaarten en panelen boven zand |

**Verhouding** (richtlijn per scherm): ±70% zand/wit, ±20% inkt/steen (tekst), ±8% petrol, ±2% baksteen/oker. Accentkleur is schaars: hoe minder, hoe sterker.

### Schalen
Voor hover-staten, achtergrondtinten en grafieken zijn schalen beschikbaar (`--mc-petrol-50` t/m `-900`, idem `baksteen`, `oker`, `neutraal`). De merkkleur zelf is petrol-800, baksteen-500 en oker-500.

| Stap | Petrol | Baksteen | Oker |
|---|---|---|---|
| 50 | `#F4F7F8` | `#F9F5F3` | `#F9F7F3` |
| 100 | `#E8EEEF` | `#F2E9E6` | `#F3EEE5` |
| 200 | `#CEE0E3` | `#E9D2C8` | `#EDDFC4` |
| 300 | `#ABC8CF` | `#DAB0A0` | `#E0C799` |
| 400 | `#7DB3BF` | `#D38769` | `#DFB25E` |
| 500 | `#5BA0AE` | `#C4613A` | `#D9A441` |
| 600 | `#478390` | `#A55231` | `#B28124` |
| 700 | `#386771` | `#824026` | `#8C651C` |
| 800 | `#1E4D57` | `#5E2F1C` | `#664A14` |
| 900 | `#1B3237` | `#3F1F13` | `#44310E` |

### Semantische tokens (gebruik deze in code)
Gebruik in componenten **altijd de semantische tokens**, nooit hexwaarden of merknamen direct. Dan werkt donkere modus automatisch.

| Token | Licht | Donker | Waarvoor |
|---|---|---|---|
| `--mc-color-bg` | `#F5F0E8` | `#0F1820` |Pagina-achtergrond |
| `--mc-color-surface` | `#FFFFFF` | `#16232D` |Kaarten, panelen, tabellen |
| `--mc-color-surface-sunken` | `#EFE8DC` | `#0B131A` |Tabelkop, invoergroepen, verzonken vlakken |
| `--mc-color-border` | `#E7DDD0` | `#26343F` |Standaardrand en scheidingslijn |
| `--mc-color-border-strong` | `#CFC6BA` | `#3A4A57` |Rand van invoervelden |
| `--mc-color-text` | `#14202B` | `#F5F0E8` |Primaire tekst |
| `--mc-color-text-muted` | `#5E6770` | `#9AA6B0` |Secundaire tekst, labels |
| `--mc-color-text-inverse` | `#FFFFFF` | `#14202B` |Tekst op donker/omgekeerd vlak |
| `--mc-color-primary` | `#1E4D57` | `#5FA3AE` |Primaire knop, link, actieve staat |
| `--mc-color-primary-hover` | `#163C44` | `#7DB8C1` |Hover van primair |
| `--mc-color-primary-subtle` | `#E1EEF0` | `#173640` |Geselecteerde rij, actief menu-item |
| `--mc-color-on-primary` | `#FFFFFF` | `#14202B` |Tekst op primair |
| `--mc-color-accent` | `#C4613A` | `#E07A52` |Accent: highlights, grafiek, logo-naald |
| `--mc-color-accent-strong` | `#A55231` | `#E07A52` |Accentknop (AA-veilig met witte tekst) |
| `--mc-color-accent-text` | `#A55231` | `#E8906C` |Accentkleur als tekst |
| `--mc-color-accent-subtle` | `#F8E6DD` | `#3A2219` |Zachte accent-achtergrond |
| `--mc-color-on-accent` | `#FFFFFF` | `#14202B` |Tekst op accent-strong |
| `--mc-color-focus` | `#2F7A87` | `#7DB8C1` |Focusring |
| `--mc-color-highlight` | `#D9A441` | `#D9A441` |Markering, tweede accent |

### Status en woningstatus

| Status | Tekst (`fg`) | Achtergrond (`bg`) | Basis |
|---|---|---|---|
| succes | `#1F6B4A` | `#E3F1E9` | `#2E8B5F` |
| waarschuwing | `#8A5A0B` | `#FBF0D9` | `#D9A441` |
| fout | `#A12A1E` | `#FBE5E1` | `#C8372B` |
| info | `#1E4D57` | `#E1EEF0` | `#2F7A87` |

Woningstatussen in labels en grafieken: **Beschikbaar** = succes, **Onder bod** = waarschuwing (oker), **Verkocht o.v.** = baksteen, **Verkocht** = inkt, **Ingetrokken** = steen. Combineer kleur altijd met tekst of een icoon; kleur alleen is nooit de enige drager van betekenis.

### Grafieken
Vaste volgorde voor reeksen: `chart-1` petrol `#1E4D57`, `chart-2` baksteen `#C4613A`, `chart-3` oker `#D9A441`, `chart-4` salie `#7C9A86`, `chart-5` mist `#8FA9B8`, `chart-6` pruim `#8A6F8F`. Maximaal 4 reeksen per grafiek; meer = opsplitsen of groeperen als "Overig" in neutraal-300. Rasterlijnen in klei, aslabels in steen. Het "eigen kantoor" of de hoofdreeks is altijd petrol; vergelijking of benchmark in neutraal-400 of stippellijn.

### Contrast (WCAG 2.1)

| Combinatie | Ratio | Oordeel |
|---|---|---|
| wit op baksteen-600 | 5.45 | AA ✓ |
| inkt op zand | 14.56 | AA ✓ |
| inkt op wit | 16.52 | AA ✓ |
| steen op zand | 5.07 | AA ✓ |
| steen op wit | 5.75 | AA ✓ |
| wit op petrol | 9.32 | AA ✓ |
| petrol op zand | 8.21 | AA ✓ |
| wit op baksteen | 4.1 | alleen groot/icoon (≥3:1) |
| baksteen op wit | 4.1 | alleen groot/icoon (≥3:1) |
| accent-text op wit | 5.45 | AA ✓ |
| oker op inkt | 7.34 | AA ✓ |
| oker op wit | 2.25 | ✗ niet voor tekst |
| zand op donker-bg | 15.8 | AA ✓ |
| donker muted op surface | 6.44 | AA ✓ |
| inkt op donker primary | 5.77 | AA ✓ |
| succes fg op bg | 5.53 | AA ✓ |
| waarschuwing fg op bg | 5.23 | AA ✓ |
| fout fg op bg | 6.07 | AA ✓ |
| info fg op bg | 7.85 | AA ✓ |

Regels die hieruit volgen:
- **Witte tekst op baksteen-500 haalt geen AA** voor normale tekst. Accentknoppen gebruiken daarom `--mc-color-accent-strong` (baksteen-600).
- **Oker nooit als tekstkleur op licht.** Oker is voor vlakken, grafieken en voor tekst/iconen op inkt.
- Secundaire tekst is steen, nooit lichter.

## 4. Typografie

| Rol | Letter | Gewichten |
|---|---|---|
| Koppen, KPI-cijfers, logo | **Sora** | 600, 700 (400 alleen in woordmerk) |
| Interface, lopende tekst, tabellen | **Figtree** | 400, 500, 600 |

Beide zijn open source (SIL OFL) en gratis via Google Fonts; de bestanden staan ook in `fonts/`.

### Schaal

| Token | Grootte / regelhoogte | Gewicht | Letter | Spatiëring |
|---|---|---|---|---|
| `display` | 48/56px | 700 | Sora | -0.02em |
| `h1` | 36/44px | 700 | Sora | -0.02em |
| `h2` | 28/36px | 600 | Sora | -0.015em |
| `h3` | 22/30px | 600 | Sora | -0.01em |
| `h4` | 18/26px | 600 | Sora | -0.005em |
| `kpi` | 40/44px | 700 | Sora | -0.02em |
| `body-lg` | 18/28px | 400 | Figtree | 0 |
| `body` | 16/24px | 400 | Figtree | 0 |
| `body-sm` | 14/20px | 400 | Figtree | 0 |
| `label` | 14/20px | 500 | Figtree | 0 |
| `caption` | 12/16px | 500 | Figtree | 0.01em |
| `overline` | 12/16px | 600 | Figtree | 0.08em |

Regels:
- Koppen in zinsvorm ("Nieuwe verkoopopdracht", niet "Nieuwe Verkoopopdracht"). Geen hoofdletters-only behalve `overline`.
- **Cijfers altijd `font-variant-numeric: tabular-nums`** in tabellen, KPI's en grafieklabels.
- Bedragen: `€ 310.000` (spatie na €, punt als duizendtal, geen ,- ). Percentages: `12,5%`. Datums: `3 okt. 2026` of `03-10-2026` in tabellen.
- Regellengte lopende tekst: 60–75 tekens.

## 5. Vorm, ruimte en diepte

- **Spacing** op een 4px-raster: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 (`--mc-space-*`). Binnen kaarten 20–24px, tussen kaarten 16–24px, tussen secties 48–64px.
- **Hoekafronding:** `sm` 6px (badges, inputs klein), `md` 10px (knoppen, inputs), `lg` 16px (kaarten, panelen), `xl` 24px (modals, marketing-blokken), `full` (pills, avatars).
- **Schaduw** spaarzaam en warm getint: kaarten liggen primair op zand met een klei-rand (`1px solid var(--mc-color-border)`); `shadow-md` alleen voor zwevende elementen (dropdowns, popovers), `shadow-lg` voor modals.
- **Beweging:** 150ms voor hover/focus, 250ms voor panelen; easing `cubic-bezier(0.2, 0, 0, 1)`. Respecteer `prefers-reduced-motion`.
- **Iconen:** lijn-iconen, 1,75–2px lijndikte, afgeronde uiteinden (bijv. Lucide). Grootte 16/20/24px. Kleur steen, of petrol bij actieve staat.

## 6. Componenten (richtlijnen)

**Knoppen** — hoogte 40px (compact 32, groot 48), radius md, Figtree 600 15px.
- Primair: petrol vlak, witte tekst; hover `primary-hover`.
- Secundair: witte achtergrond, 1,5px petrol rand, petrol tekst.
- Tertiair/ghost: alleen petrol tekst, hover `primary-subtle` vlak.
- Accent (spaarzaam, max. 1 per scherm, vooral marketing): `accent-strong` vlak, witte tekst.
- Destructief: `fout-base` vlak, witte tekst, altijd met bevestiging.
- Focus: 2px ring in `--mc-color-focus` met 2px offset. Nooit outline verwijderen.

**KPI-tegel** — witte kaart, radius lg, rand klei, padding 24. Label (label-token, steen) → waarde (kpi-token, Sora 700, inkt, tabular) → trend-pill (succes/fout bg+fg, met ↑/↓) → optioneel mini-grafiek in petrol met laatste waarde in baksteen.

**Tabellen** — kop in `caption`/`overline` steen op `surface-sunken`; rijen 48px, scheidingslijn klei; getallen rechts uitgelijnd en tabular; hover-rij `primary-subtle` op 50%. Statuskolom als label (pill, radius full, status-bg + status-fg).

**Formulieren** — label boven het veld (label-token), veld 40px, witte achtergrond, rand border-strong, radius md; focus = petrol rand + focusring; foutmelding in `fout-fg` onder het veld met icoon.

**Navigatie** — zijbalk op licht: wit met klei-rand rechts, actief item `primary-subtle` vlak + petrol tekst + 3px petrol indicator. Ingeklapt: alleen `icoon-kleur`. Topbalk 64px met horizontaal logo (hoogte 28–32px).

**Lege staten en laden** — lijn-illustratie of icoon in klei/steen, één zin uitleg, één primaire actie. Skeletons in neutraal-100 met zachte puls.

## 7. Beeld

- Fotografie: echte woningen en echte mensen van kantoren, natuurlijk licht, warme tinten. Geen stockfoto's met handdrukken of sleutelbossen.
- Over foto's: tekst alleen op een inkt-overlay van minimaal 60% of in een wit/zand paneel.
- Schermafbeeldingen van de app in marketing: op zand of petrol-50, radius xl, shadow-lg.

## 8. Tone of voice

- **Jij-vorm**, direct en vriendelijk. "Je hebt 3 nieuwe leads", niet "Er zijn 3 nieuwe leads beschikbaar voor u."
- **Kort en concreet.** Werkwoord voorop in knoppen: "Opdracht aanmaken", "Leads toewijzen".
- **Vakjargon van de makelaar** mag (verkoopopdracht, taxatie, onder bod, transport), IT-jargon niet (sync, API, webhook) in de interface voor eindgebruikers.
- **Eerlijk bij fouten:** zeg wat er misging en wat de gebruiker kan doen. "We konden Realworks niet bereiken. Probeer het over een paar minuten opnieuw."
- Geen uitroeptekens-overload en geen emoji in de interface.

## 9. Bestanden

```
brand/
  BRAND.md                  ← dit document
  README.md                 ← gebruik & installatie
  huisstijlhandboek.pdf     ← visuele versie om te delen
  logo/svg/                 ← alle logoversies (vector, tekst omgezet naar paden)
  logo/png/                 ← transparante PNG's in meerdere breedtes
  logo/favicon/             ← favicon.svg, favicon.ico, apple-touch-icon.png, app-iconen 192/512
  tokens/tokens.json        ← W3C design tokens (bron)
  tokens/tokens.css         ← CSS custom properties incl. donkere modus
  tokens/tailwind-theme.css ← Tailwind v4 @theme
  tokens/tailwind.config.js ← Tailwind v3 preset
  fonts/                    ← Sora & Figtree (variabel, OFL)
```

## 10. Instructies voor Claude Code

Als je (Claude Code) UI bouwt voor MakelaarsCockpit:
1. Importeer `tokens/tokens.css` globaal en gebruik **alleen `--mc-color-*` semantische tokens** of de Tailwind-klassen die daarop mappen (`bg-bg`, `bg-surface`, `text-text`, `text-text-muted`, `bg-primary`, `border-border`, …). Geen losse hexwaarden in componenten.
2. Koppen en KPI-cijfers in `font-display` (Sora), al het andere in `font-sans` (Figtree). Getallen met `tabular-nums`.
3. Pagina-achtergrond is `bg` (zand), kaarten zijn `surface` (wit) met `border` en radius `lg`.
4. Gebruik het logo uit `logo/svg/` als `<img>` of inline SVG; typ de naam nooit na als logo.
5. Baksteen/accent maximaal één keer per scherm als actie; petrol is de standaard voor interactie.
6. Controleer contrast met de tabel in §3; oker nooit als tekst op licht.
7. Ondersteun donkere modus via `[data-theme="dark"]` op `<html>`; alle tokens schakelen mee.
8. Teksten in het Nederlands, jij-vorm, volgens §8.
