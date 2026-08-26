# Nautilus

**Nautilus** — a local, Pokédex-themed app for tracking your **Living Dex** completion. Like the
shell it's named for, you fill it chamber by chamber toward a complete collection: a separate
check-off grid for the **Normal** and **Shiny** dex of every mainline Pokémon game
(Gen 1 → Gen 9), plus a **National / HOME** master living dex. Sprites and species
data come from [PokeAPI](https://pokeapi.co).

## Features

- ✅ Click any Pokémon to check it off — caught sprites light up in full colour,
  missing ones stay greyed out.
- ✨ **Separate Normal and Shiny living dexes** for each game.
- 🎮 **21 games + a National Dex** (all 1,025 species), each with its own
  completion bar.
- 📊 **Reports** view: National living-dex %, all-games-combined %, and a
  per-game completion table for both Normal and Shiny.
- 🎨 Switch between crisp **HOME** renders and retro **Pixel** sprites.
- 🌙 **Light / Dark** Pokédex theme.
- 🔍 Search by name or number, filter by Caught / Missing, and (for the National
  dex) filter by generation.
- 💾 **Progress saves automatically** to `data/progress.json` — it lives with the
  app folder, so you can back it up or move it anywhere. A copy is also kept in
  your browser as a fallback.

## Run it

You need [Node.js](https://nodejs.org) (v18 or newer). No `npm install` required —
the app has zero dependencies.

```bash
node server.js
```

Then open **http://localhost:3000** (the server also tries to open it for you).
Press `Ctrl+C` in the terminal to stop.

> On Windows you can also double-click `start.bat`.

## Refreshing the Pokémon data

The species/sprite data is pre-generated into `public/data/pokedex.json`. To rebuild
it from PokeAPI (e.g. when a new game is added):

```bash
node scripts/build-data.js
```

## Notes

- Dex numbers and sprites use **National Dex numbering**, which matches how Pokémon
  HOME arranges living-dex boxes.
- Each game tracks its own regional dex, so a species caught in one game is tracked
  independently in another — exactly like real cartridges.
- Not affiliated with Nintendo, Game Freak, or The Pokémon Company. Sprites/data ©
  their respective owners, served via PokeAPI.
