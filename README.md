# SOLMAR

An original open-world crime game for the desktop browser, built for make.fun's
**gta6-01** bounty ("Make GTA 6"). Everything — the city, the story, the
characters, the art, the sound — is its own; nothing comes from any commercial
game.

You are **Marlo Reyes**, back in the pastel coastal city of Solmar after six
years away. Your aunt Rosa needs a debt collected, and one favour becomes five
story jobs: a stolen car, a night run through the marina, a checkpoint race
against the clock, and a gold coupe every cop in the city is hunting. Between
jobs the city is yours — run taxi fares, hunt the twenty shells on the beach,
and manage your wanted level, because Solmar PD always answers.

## What's in the game

- A generated coastal city: downtown towers, suburbs, a port warehouse, an
  airfield, a marina with piers, a palm-lined beach and the ocean.
- On foot and behind the wheel: walk, run, steal and drive cars with real
  driving physics, traffic that follows the road grid, and pedestrians who
  stroll, hail fares, and run from trouble.
- A wanted system: crimes are weighed by whether anyone saw them; patrol cars
  hunt you, foot officers make arrests, and from three stars they shoot.
- Five story missions with dialogue, plus fares, collectibles, a day/night
  cycle with lit streets, synthesised engine/siren/music audio, a HUD with a
  live minimap, a start screen, pause, and a localStorage save.

## Play it

```sh
node serve.ts        # then open http://localhost:8901
```

Any static file server pointed at `game/` works too; there is no build step
and the game makes no network requests.

## Hand it in

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

copies `game/` and `screenshots/` to `out/` and writes `out/dossier.json` with
the kit's `vendor/makefun-game.ts`, exactly as the bounty requires.

## Layout

- `main.ts` — the entry program that hands the game in.
- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  `world.js` the city, `render.js` the drawing, `vehicles.js` cars and
  traffic, `police.js` the wanted system, `missions.js` the story,
  `player.js` Marlo, `peds.js` the crowd, `hud.js` the HUD and minimap,
  `audio.js` the synthesised sound, `input.js`, `save.js`, `theme.js`,
  `util.js`.
- `screenshots/` — four staged renders of the game, produced by its headless
  render mode (`tools/render-screenshots.mjs`) from the game's own city data.
- `tools/smoke-test.mjs` — a headless play-through of the simulation.

MIT licensed — see `LICENSE`.
