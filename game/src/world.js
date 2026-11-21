// world.js — Solmar itself: a pastel coastal city generated once from a seed.
// Pure data and geometry (no DOM), so the game, the minimap and the headless
// screenshot renderer all read the same streets, buildings and beaches.
import { COLORS } from './theme.js';
import { clamp, makeRng, randInt, randRange, pushOutOfRect } from './util.js';

export const WORLD_W = 3800;
export const WORLD_H = 2600;
export const ROAD_W = 92;

// Avenues run north-south, streets east-west; the last avenue is the coast road.
export const AVENUES = [300, 700, 1100, 1500, 1900, 2300, 2700, 3120];
export const STREETS = [300, 650, 1000, 1350, 1700, 2050];
export const BEACH_X = 3260;
export const WATER_X = 3520;

// Door/stepping-off points for the named places (just outside each building).
export const places = {
  home: { x: 900, y: 1265, name: "Marlo's Place" },
  diner: { x: 1300, y: 210, name: "Rosa's Diner" },
  chopShop: { x: 225, y: 1520, name: "Dex's Chop Shop" },
  hospital: { x: 1700, y: 1615, name: 'Solmar General' },
  warehouse: { x: 500, y: 2495, name: 'Port Warehouse 9' },
  marina: { x: 3220, y: 2160, name: 'Solmar Marina' },
  airport: { x: 420, y: 2330, name: 'Solmar Airfield' },
  pierEnd: { x: 3660, y: 2125, name: 'Pier End' },
};

// Wooden piers reaching into the water from the marina shore.
export const piers = [
  { x: 3260, y: 1948, w: 430, h: 42 },
  { x: 3260, y: 2104, w: 460, h: 42 },
  { x: 3260, y: 2260, w: 430, h: 42 },
];
export const runway = { x: 110, y: 2400, w: 980, h: 110 };

function blockGaps(centers, worldSize) {
  const cuts = [0];
  for (const c of centers) cuts.push(c - ROAD_W / 2, c + ROAD_W / 2);
  cuts.push(worldSize);
  const gaps = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) gaps.push([cuts[i], cuts[i + 1]]);
  return gaps;
}

const SPECIAL_BLOCKS = new Map([
  ['3,0', 'diner'],
  ['2,3', 'home'],
  ['0,4', 'chopShop'],
  ['4,4', 'hospital'],
  ['1,6', 'warehouse'],
  ['0,6', 'airfield'],
]);
const PARK_BLOCKS = new Set(['1,1', '5,2', '6,5', '3,5']);
const LOT_BLOCKS = new Set(['2,1', '6,3', '4,5', '5,0']);

export const buildings = [];
export const blocks = []; // park / lot / airfield rectangles, for the renderer
export const palms = [];
export const lamps = [];
export const parkingSpots = [];
export const shellSpots = [];

function districtOf(cx, cy) {
  if (cx > 1000 && cx < 2050 && cy > 500 && cy < 1550) return 'downtown';
  if (cx > 600 && cx < 2500 && cy > 200 && cy < 2100) return 'mid';
  return 'suburb';
}

function buildCity() {
  const rng = makeRng(20261121);
  const cols = blockGaps(AVENUES, WORLD_W);
  const rows = blockGaps(STREETS, WORLD_H);
  for (let ci = 0; ci < cols.length; ci++) {
    for (let ri = 0; ri < rows.length; ri++) {
      const [x0, x1] = cols[ci];
      const [y0, y1] = rows[ri];
      if (x0 >= 3074) continue; // east of the coast road: beach and water, no blocks
      const key = ci + ',' + ri;
      const bx = x0 + 16;
      const by = y0 + 16;
      const bw = x1 - x0 - 32;
      const bh = y1 - y0 - 32;
      if (bw < 60 || bh < 60) continue;
      const special = SPECIAL_BLOCKS.get(key);
      if (special === 'airfield') {
        blocks.push({ x: bx, y: by, w: bw, h: bh, kind: 'airfield' });
        continue; // runway is drawn as ground
      }
      if (PARK_BLOCKS.has(key)) {
        blocks.push({ x: bx, y: by, w: bw, h: bh, kind: 'park' });
        for (let i = 0; i < 10; i++) {
          palms.push({ x: randRange(rng, bx + 10, bx + bw - 10), y: randRange(rng, by + 10, by + bh - 10), s: randRange(rng, 0.8, 1.3) });
        }
        continue;
      }
      if (LOT_BLOCKS.has(key)) {
        blocks.push({ x: bx, y: by, w: bw, h: bh, kind: 'lot' });
        for (let px = bx + 24; px < bx + bw - 20; px += 44) {
          for (let py = by + 22; py < by + bh - 16; py += 58) {
            parkingSpots.push({ x: px, y: py, angle: Math.PI / 2 });
          }
        }
        continue;
      }
      if (special) {
        const spot = { diner: places.diner, home: places.home, chopShop: places.chopShop, hospital: places.hospital, warehouse: places.warehouse }[special];
        buildings.push({
          x: bx + bw * 0.18, y: by + bh * 0.16, w: bw * 0.64, h: bh * 0.6,
          floors: 1, color: '#f6f1e7', roof: '#8d8577', name: spot.name, special,
        });
        continue;
      }
      const district = districtOf(bx + bw / 2, by + bh / 2);
      const nx = bw > 230 ? 2 : 1;
      const ny = bh > 200 ? 2 : 1;
      const cw = (bw - (nx - 1) * 12) / nx;
      const ch = (bh - (ny - 1) * 12) / ny;
      const palette = { downtown: 'downtown', mid: 'mid', suburb: 'suburb' }[district];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          if (rng() < 0.08) continue; // the odd empty lot
          const floors = district === 'downtown' ? randInt(rng, 4, 9) : district === 'mid' ? randInt(rng, 2, 5) : randInt(rng, 1, 2);
          buildings.push({
            x: bx + i * (cw + 12), y: by + j * (ch + 12), w: cw, h: ch, floors,
            color: '', roof: '', district, palette,
            ci: Math.floor(rng() * 6), ri: Math.floor(rng() * 5),
          });
        }
      }
    }
  }
  // Palm rows along the coast road and the beach, plus park scatter.
  for (let y = 110; y < WORLD_H - 80; y += 105) {
    palms.push({ x: 3200 + randRange(rng, -6, 6), y: y + randRange(rng, -18, 18), s: randRange(rng, 0.9, 1.4) });
    if (rng() < 0.7) palms.push({ x: 3320 + randRange(rng, 0, 60), y: y + randRange(rng, -30, 30), s: randRange(rng, 0.8, 1.2) });
  }
  // Street lamps at intersection corners.
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      lamps.push({ x: ax - ROAD_W / 2 - 8, y: sy - ROAD_W / 2 - 8 });
      lamps.push({ x: ax + ROAD_W / 2 + 8, y: sy + ROAD_W / 2 + 8 });
    }
  }
  // Collectible shells scattered down the beach.
  for (let i = 0; i < 20; i++) {
    shellSpots.push({ x: randRange(rng, BEACH_X + 40, WATER_X - 50), y: randRange(rng, 120, WORLD_H - 140) });
  }
}
buildCity();

// What is under a point: drives drag, splashes, and where peds may walk.
export function groundAt(x, y) {
  for (const p of piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'pier';
  }
  if (x >= WATER_X) return 'water';
  if (x >= BEACH_X) return 'sand';
  if (x >= runway.x && x <= runway.x + runway.w && y >= runway.y && y <= runway.y + runway.h) return 'runway';
  for (const c of AVENUES) if (Math.abs(x - c) <= ROAD_W / 2) return 'road';
  for (const c of STREETS) if (Math.abs(y - c) <= ROAD_W / 2) return 'road';
  return 'land';
}

export function isOnRoad(x, y) {
  return groundAt(x, y) === 'road';
}

// Resolve a moving circle against buildings, the shoreline and the world edge.
export function collideCircle(x, y, r) {
  let hit = false;
  for (const b of buildings) {
    const [nx, ny, pushed] = pushOutOfRect(x, y, r, b);
    if (pushed) { x = nx; y = ny; hit = true; }
  }
  // Water is a wall except on the piers.
  if (x + r > WATER_X && groundAt(x, y) !== 'pier') {
    x = WATER_X - r;
    hit = true;
  }
  x = clamp(x, r, WORLD_W - r);
  y = clamp(y, r, WORLD_H - r);
  return [x, y, hit];
}

export function buildingAt(x, y) {
  for (const b of buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// Intersections of the road grid, for traffic routing.
export const intersections = [];
for (const ax of AVENUES) for (const sy of STREETS) intersections.push({ x: ax, y: sy });

export { COLORS };
