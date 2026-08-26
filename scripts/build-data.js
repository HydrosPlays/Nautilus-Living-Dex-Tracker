/*
 * build-data.js
 * Fetches Pokédex data from PokeAPI once and writes public/data/pokedex.json.
 * Run with:  node scripts/build-data.js
 *
 * The generated file is what the app actually reads. Sprite image URLs are
 * built on the client from each Pokémon's National Dex id, so we only need to
 * store ids + names here (keeps the file small).
 */

const fs = require('fs');
const path = require('path');

const API = 'https://pokeapi.co/api/v2';

// Ordered list of mainline games and the PokeAPI regional dex(es) each uses.
// Multi-dex entries (X&Y, SwSh, SV) merge the base dex with its DLC dexes.
const GAMES = [
  { id: 'red-blue',             name: 'Red & Blue',                    gen: 1, region: 'Kanto',  dex: ['kanto'], noShiny: true },
  { id: 'yellow',               name: 'Yellow',                        gen: 1, region: 'Kanto',  dex: ['kanto'], noShiny: true },
  { id: 'gold-silver',          name: 'Gold & Silver',                 gen: 2, region: 'Johto',  dex: ['original-johto'] },
  { id: 'crystal',              name: 'Crystal',                       gen: 2, region: 'Johto',  dex: ['original-johto'] },
  { id: 'ruby-sapphire',        name: 'Ruby & Sapphire',               gen: 3, region: 'Hoenn',  dex: ['hoenn'] },
  { id: 'emerald',              name: 'Emerald',                       gen: 3, region: 'Hoenn',  dex: ['hoenn'] },
  { id: 'firered-leafgreen',    name: 'FireRed & LeafGreen',           gen: 3, region: 'Kanto',  dex: ['kanto'] },
  { id: 'diamond-pearl',        name: 'Diamond & Pearl',               gen: 4, region: 'Sinnoh', dex: ['original-sinnoh'] },
  { id: 'platinum',             name: 'Platinum',                      gen: 4, region: 'Sinnoh', dex: ['extended-sinnoh'] },
  { id: 'heartgold-soulsilver', name: 'HeartGold & SoulSilver',        gen: 4, region: 'Johto',  dex: ['updated-johto'] },
  { id: 'black-white',          name: 'Black & White',                 gen: 5, region: 'Unova',  dex: ['original-unova'] },
  { id: 'black2-white2',        name: 'Black 2 & White 2',             gen: 5, region: 'Unova',  dex: ['updated-unova'] },
  { id: 'x-y',                  name: 'X & Y',                         gen: 6, region: 'Kalos',  dex: ['kalos-central', 'kalos-coastal', 'kalos-mountain'] },
  { id: 'oras',                 name: 'Omega Ruby & Alpha Sapphire',   gen: 6, region: 'Hoenn',  dex: ['updated-hoenn'] },
  { id: 'sun-moon',             name: 'Sun & Moon',                    gen: 7, region: 'Alola',  dex: ['original-alola'] },
  { id: 'usum',                 name: 'Ultra Sun & Ultra Moon',        gen: 7, region: 'Alola',  dex: ['updated-alola'] },
  { id: 'lets-go',              name: "Let's Go Pikachu & Eevee",      gen: 7, region: 'Kanto',  dex: ['letsgo-kanto'] },
  { id: 'sword-shield',         name: 'Sword & Shield',                gen: 8, region: 'Galar',  dex: ['galar', 'isle-of-armor', 'crown-tundra'] },
  { id: 'bdsp',                 name: 'Brilliant Diamond & Shining Pearl', gen: 8, region: 'Sinnoh', dex: ['extended-sinnoh'] },
  { id: 'legends-arceus',       name: 'Legends: Arceus',               gen: 8, region: 'Hisui',  dex: ['hisui'] },
  { id: 'scarlet-violet',       name: 'Scarlet & Violet',              gen: 9, region: 'Paldea', dex: ['paldea', 'kitakami', 'blueberry'] },
  { id: 'legends-za',           name: 'Legends: Z-A',                  gen: 9, region: 'Lumiose City', dex: ['lumiose-city', 'hyperspace'] },
];

// National Dex id -> generation, by range.
const GEN_RANGES = [
  [1, 151, 1], [152, 251, 2], [252, 386, 3], [387, 493, 4], [494, 649, 5],
  [650, 721, 6], [722, 809, 7], [810, 905, 8], [906, 1025, 9],
];
function genForId(id) {
  for (const [lo, hi, g] of GEN_RANGES) if (id >= lo && id <= hi) return g;
  return 0;
}

// Friendly section labels for the multi-region (DLC) games.
const DEX_LABELS = {
  'kalos-central': 'Central Kalos',
  'kalos-coastal': 'Coastal Kalos',
  'kalos-mountain': 'Mountain Kalos',
  'galar': 'Galar',
  'isle-of-armor': 'Isle of Armor',
  'crown-tundra': 'Crown Tundra',
  'paldea': 'Paldea',
  'kitakami': 'Kitakami — Teal Mask',
  'blueberry': 'Blueberry Academy — Indigo Disk',
  'lumiose-city': 'Lumiose City',
  'hyperspace': 'Hyperspace — Mega Dimension',
};

// Special-cased display names; everything else is title-cased from the slug.
const NAME_OVERRIDES = {
  'nidoran-f': 'Nidoran♀', 'nidoran-m': 'Nidoran♂',
  'mr-mime': 'Mr. Mime', 'mime-jr': 'Mime Jr.', 'mr-rime': 'Mr. Rime',
  'farfetchd': "Farfetch'd", 'sirfetchd': "Sirfetch'd",
  'ho-oh': 'Ho-Oh', 'porygon-z': 'Porygon-Z', 'porygon2': 'Porygon2',
  'type-null': 'Type: Null', 'jangmo-o': 'Jangmo-o', 'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o', 'flabebe': 'Flabébé',
  'tapu-koko': 'Tapu Koko', 'tapu-lele': 'Tapu Lele',
  'tapu-bulu': 'Tapu Bulu', 'tapu-fini': 'Tapu Fini',
  'wo-chien': 'Wo-Chien', 'chien-pao': 'Chien-Pao',
  'ting-lu': 'Ting-Lu', 'chi-yu': 'Chi-Yu',
  'great-tusk': 'Great Tusk', 'scream-tail': 'Scream Tail',
  'brute-bonnet': 'Brute Bonnet', 'flutter-mane': 'Flutter Mane',
  'slither-wing': 'Slither Wing', 'sandy-shocks': 'Sandy Shocks',
  'iron-treads': 'Iron Treads', 'iron-bundle': 'Iron Bundle',
  'iron-hands': 'Iron Hands', 'iron-jugulis': 'Iron Jugulis',
  'iron-moth': 'Iron Moth', 'iron-thorns': 'Iron Thorns',
  'roaring-moon': 'Roaring Moon', 'iron-valiant': 'Iron Valiant',
  'walking-wake': 'Walking Wake', 'iron-leaves': 'Iron Leaves',
  'gouging-fire': 'Gouging Fire', 'raging-bolt': 'Raging Bolt',
  'iron-boulder': 'Iron Boulder', 'iron-crown': 'Iron Crown',
};
function prettyName(slug) {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function idFromSpeciesUrl(url) {
  const m = url.match(/\/pokemon-species\/(\d+)\/?$/);
  return m ? parseInt(m[1], 10) : null;
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
}

async function main() {
  console.log('Fetching National Dex...');
  const national = await getJson(`${API}/pokedex/national`);

  const pokemon = {};              // id -> { name, gen }
  const nationalSpecies = [];      // all national ids, in order
  for (const entry of national.pokemon_entries) {
    const id = idFromSpeciesUrl(entry.pokemon_species.url);
    if (!id || id > 1025) continue; // skip alt-form species ids (>10000)
    pokemon[id] = { name: prettyName(entry.pokemon_species.name), gen: genForId(id) };
    nationalSpecies.push(id);
  }
  nationalSpecies.sort((a, b) => a - b);
  console.log(`  ${nationalSpecies.length} species catalogued.`);

  // Cache dex fetches so shared dexes (e.g. kanto) are only fetched once.
  const dexCache = {};
  async function getDex(slug) {
    if (!dexCache[slug]) {
      process.stdout.write(`  dex: ${slug} ... `);
      const data = await getJson(`${API}/pokedex/${slug}`);
      const entries = [];
      for (const entry of data.pokemon_entries) {
        const id = idFromSpeciesUrl(entry.pokemon_species.url);
        if (id && id <= 1025) entries.push({ id, no: entry.entry_number });
      }
      // Keep the game's own dex order (by regional entry number).
      entries.sort((a, b) => a.no - b.no);
      dexCache[slug] = entries;
      console.log(`${entries.length} species`);
    }
    return dexCache[slug];
  }

  const games = [];
  for (const g of GAMES) {
    const seen = new Set();
    const species = [];   // national ids, in this game's dex order
    const nums = [];      // parallel: this game's regional dex numbers
    const sections = [];  // ordered {label, count} for multi-region games
    for (const slug of g.dex) {
      let count = 0;
      for (const { id, no } of await getDex(slug)) {
        if (seen.has(id)) continue; // first sub-dex a species appears in wins
        seen.add(id);
        species.push(id);
        nums.push(no);
        count++;
      }
      sections.push({ label: DEX_LABELS[slug] || slug, count });
    }
    const game = { id: g.id, name: g.name, gen: g.gen, region: g.region, total: species.length, species, nums };
    if (g.dex.length > 1) game.sections = sections; // only when a game has sub-dexes
    if (g.noShiny) game.noShiny = true;             // Gen 1 had no Shiny Pokémon
    games.push(game);
  }

  // National / HOME living dex as the final "game" — National Dex numbering.
  games.push({
    id: 'national', name: 'National Dex — HOME Living Dex', gen: 0,
    region: 'All Regions', total: nationalSpecies.length,
    species: nationalSpecies, nums: nationalSpecies.slice(),
  });

  const out = { generatedAt: new Date().toISOString(), source: 'PokeAPI (pokeapi.co)', pokemon, games };

  const outDir = path.join(__dirname, '..', 'public', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'pokedex.json');
  fs.writeFileSync(outFile, JSON.stringify(out));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`\nWrote ${outFile} (${kb} KB) — ${games.length} games.`);
}

main().catch(err => { console.error('Build failed:', err); process.exit(1); });
