# MakelaarsCockpit — huisstijlpakket v1.0

Alles wat nodig is om MakelaarsCockpit (app, website, documenten) consistent vorm te geven.

## Snel starten

**In een codebase (Claude Code):**
1. Kopieer deze map als `brand/` naar de root van je repo.
2. Voeg aan `CLAUDE.md` toe:
   ```
   ## Huisstijl
   Volg altijd brand/BRAND.md voor kleuren, typografie, componenten en tone of voice.
   Gebruik uitsluitend de tokens uit brand/tokens/ (semantische --mc-color-* variabelen), nooit losse hexwaarden.
   Logo's staan in brand/logo/svg/.
   ```
3. Importeer de tokens:
   - Plain CSS: `@import './brand/tokens/tokens.css';`
   - Tailwind v4: `@import 'tailwindcss'; @import './brand/tokens/tokens.css'; @import './brand/tokens/tailwind-theme.css';`
   - Tailwind v3: `presets: [require('./brand/tokens/tailwind.config.js')]` in `tailwind.config.js` én `tokens.css` globaal importeren.
4. Favicons in `<head>`:
   ```html
   <link rel="icon" href="/favicon.ico" sizes="48x48">
   <link rel="icon" href="/favicon.svg" type="image/svg+xml">
   <link rel="apple-touch-icon" href="/apple-touch-icon.png">
   ```

**Elders (Word, PowerPoint, Canva, drukwerk):**
- Gebruik de PNG's uit `logo/png/` (transparant) of de SVG's voor drukwerk.
- Installeer de fonts uit `fonts/` of via Google Fonts (Sora, Figtree).
- Kleurcodes en regels staan in `huisstijlhandboek.pdf` en `BRAND.md`.

## Inhoud
- `BRAND.md` — de volledige huisstijl (bron van waarheid)
- `huisstijlhandboek.pdf` — visuele versie om te delen
- `logo/` — SVG, PNG, favicons en app-iconen
- `tokens/` — design tokens (JSON, CSS, Tailwind v3/v4)
- `fonts/` — Sora en Figtree (SIL Open Font License)
