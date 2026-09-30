// Kopieert de huisstijl uit docs/huisstijl (bron van waarheid) naar apps/web. Draai na elke wijziging in de huisstijl: npm run brand:sync
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'docs/huisstijl');
const web = join(root, 'apps/web');

const copy = (from, to) => {
  mkdirSync(dirname(join(web, to)), { recursive: true });
  cpSync(join(brand, from), join(web, to));
};

// Tokens: de Google Fonts-import eruit, want de lettertypen worden zelf gehost via next/font/local.
mkdirSync(join(web, 'src/styles/brand'), { recursive: true });
const tokens = readFileSync(join(brand, 'tokens/tokens.css'), 'utf8')
  .split('\n')
  .filter((line) => !line.startsWith('@import url('))
  .join('\n');
writeFileSync(join(web, 'src/styles/brand/tokens.css'), `/* Gegenereerd door scripts/sync-brand.mjs uit docs/huisstijl/tokens/tokens.css; niet handmatig wijzigen. */\n${tokens}`);
copy('tokens/tailwind-theme.css', 'src/styles/brand/tailwind-theme.css');

copy('fonts/Sora-Variable.ttf', 'src/app/fonts/Sora-Variable.ttf');
copy('fonts/Figtree-Variable.ttf', 'src/app/fonts/Figtree-Variable.ttf');

copy('logo/png/makelaarscockpit-logo-horizontaal-kleur-600px.png', 'public/brand/logo-horizontaal-kleur.png');
copy('logo/png/makelaarscockpit-logo-horizontaal-donker-600px.png', 'public/brand/logo-horizontaal-donker.png');
copy('logo/png/makelaarscockpit-logo-gestapeld-kleur-400px.png', 'public/brand/logo-gestapeld-kleur.png');
copy('logo/svg/makelaarscockpit-icoon-kleur.svg', 'public/brand/icoon-kleur.svg');
copy('logo/svg/makelaarscockpit-icoon-donker.svg', 'public/brand/icoon-donker.svg');

copy('logo/favicon/favicon.ico', 'src/app/favicon.ico');
copy('logo/favicon/favicon.svg', 'src/app/icon.svg');
copy('logo/favicon/apple-touch-icon.png', 'src/app/apple-icon.png');

console.log('Huisstijl gesynchroniseerd naar apps/web.');
