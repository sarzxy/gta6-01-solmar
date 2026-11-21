// render-screenshots.mjs — SOLMAR's headless render mode. There is no browser
// on this machine, so the game's staged scenes are drawn by this software
// rasterizer from the game's own modules (world.js city data, theme.js
// palette, the same HUD layout as hud.js) and written as PNG screenshots.
// Usage: node tools/render-screenshots.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVENUES, BEACH_X, ROAD_W, STREETS, WATER_X, WORLD_H, WORLD_W,
  blocks, buildings, lamps, palms, piers, places, runway,
} from '../game/src/world.js';
import { BUILDING_PALETTES, CAR_COLORS, COLORS, PED_COLORS, ROOF_COLORS, duskFactor, nightFactor } from '../game/src/theme.js';

const W = 1280;
const H = 720;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- framebuffer ----------
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}
class FB {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 3);
  }
  set(x, y, rgb, alpha = 1) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    if (alpha >= 1) {
      this.data[i] = rgb[0];
      this.data[i + 1] = rgb[1];
      this.data[i + 2] = rgb[2];
    } else {
      this.data[i] += (rgb[0] - this.data[i]) * alpha;
      this.data[i + 1] += (rgb[1] - this.data[i + 1]) * alpha;
      this.data[i + 2] += (rgb[2] - this.data[i + 2]) * alpha;
    }
  }
  rect(x, y, w, h, rgb, alpha = 1) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, rgb, alpha);
    }
  }
  circle(cx, cy, r, rgb, alpha = 1) {
    for (let yy = Math.floor(cy - r); yy <= cy + r; yy++) {
      for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r * r) this.set(xx, yy, rgb, alpha);
      }
    }
  }
  ring(cx, cy, r, width, rgb, alpha = 1) {
    for (let yy = Math.floor(cy - r - width); yy <= cy + r + width; yy++) {
      for (let xx = Math.floor(cx - r - width); xx <= cx + r + width; xx++) {
        const d = Math.hypot(xx - cx, yy - cy);
        if (Math.abs(d - r) <= width / 2) this.set(xx, yy, rgb, alpha);
      }
    }
  }
  line(x0, y0, x1, y1, width, rgb, alpha = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, rgb, alpha);
    }
  }
  poly(points, rgb, alpha = 1) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let yy = Math.floor(minY); yy <= maxY; yy++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= yy && y2 > yy) || (y2 <= yy && y1 > yy)) {
          xs.push(x1 + ((yy - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let xx = Math.floor(xs[i]); xx <= xs[i + 1]; xx++) this.set(xx, yy, rgb, alpha);
      }
    }
  }
  rotRect(cx, cy, w, h, angle, rgb, alpha = 1) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const hw = w / 2;
    const hh = h / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [
      cx + x * c - y * s, cy + x * s + y * c,
    ]);
    this.poly(pts, rgb, alpha);
  }
  glow(cx, cy, r, rgb, strength) {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.h, Math.ceil(cy + r));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const d = Math.hypot(xx - cx, yy - cy) / r;
        if (d < 1) this.set(xx, yy, rgb, strength * (1 - d) * (1 - d));
      }
    }
  }
  darken(rgb, alpha) {
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] += (rgb[0] - this.data[i]) * alpha;
      this.data[i + 1] += (rgb[1] - this.data[i + 1]) * alpha;
      this.data[i + 2] += (rgb[2] - this.data[i + 2]) * alpha;
    }
  }
}

// ---------- 5x7 bitmap font (uppercase; lowercase is folded up) ----------
const GLYPHS = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.####/#..../#..../#..../#..../#..../.####', D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
  G: '.####/#..../#..../#.###/#...#/#...#/.###.', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '#####/..#../..#../..#../..#../..#../#####', J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.', P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.', V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/.#.#./..#../..#../..#../.#.#./#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
  '0': '.###./#..##/#.#.#/##..#/#...#/#...#/.###.', '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/..##./.#.../#..../#####', '3': '.###./#...#/....#/..##./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#/#####/...#./...#.', '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '.###./#..../#..../####./#...#/#...#/.###.', '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.', '9': '.###./#...#/#...#/.####/....#/....#/.###.',
  ' ': '...../...../...../...../...../...../.....', '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../.##../.#...', '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/..##./..#../...../..#..', ':': '...../.##../.##../...../.##../.##../.....',
  "'": '..#../..#../.#.../...../...../...../.....', '-': '...../...../...../#####/...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....', '/': '....#/....#/..#../..#../.#.../#..../#....',
  '$': '..#../.####/##.#./.###./..###/####./..#..', '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#/....#/....#/..#../.#...', '%': '##..#/##.#./....#/..#../.#.../#..../#.##.',
  '>': '#..../.#.../..#../...#./..#../.#.../#....', '·': '...../...../...../.##../.##../...../.....',
};
function text(fb, str, x, y, scale, rgb, alpha = 1) {
  let cx = x;
  for (const chRaw of str) {
    const ch = chRaw.toUpperCase();
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    const rows = glyph.split('/');
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if (rows[ry][rx] === '#') fb.rect(cx + rx * scale, y + ry * scale, scale, scale, rgb, alpha);
      }
    }
    cx += 6 * scale;
  }
  return cx - x;
}
function textWidth(str, scale) {
  return str.length * 6 * scale;
}
function wrap(str, maxChars) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : line + ' ' + word;
    if (next.length > maxChars && line !== '') {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

// ---------- PNG writer ----------
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(fb) {
  const raw = Buffer.alloc((fb.w * 3 + 1) * fb.h);
  let prevRow = null;
  for (let y = 0; y < fb.h; y++) {
    const rowStart = y * (fb.w * 3 + 1);
    const row = fb.data.subarray(y * fb.w * 3, (y + 1) * fb.w * 3);
    // Pick the cheapest of None/Sub/Up by summed absolute signed deltas.
    let bestType = 0;
    let bestScore = Infinity;
    let bestRow = null;
    for (const type of [0, 1, 2]) {
      let score = 0;
      const out = Buffer.alloc(fb.w * 3);
      for (let i = 0; i < row.length; i++) {
        const left = i >= 3 ? row[i - 3] : 0;
        const up = prevRow ? prevRow[i] : 0;
        const v = type === 0 ? row[i] : type === 1 ? (row[i] - left) & 0xff : (row[i] - up) & 0xff;
        out[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; bestType = type; bestRow = out; }
    }
    raw[rowStart] = bestType;
    bestRow.copy(raw, rowStart + 1);
    prevRow = row;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(fb.w, 0);
  ihdr.writeUInt32BE(fb.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- world drawing (mirrors render.js, in world coordinates) ----------
function hash2(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
const C = (hex) => hexRgb(hex);

function drawWorld(fb, ox, oy) {
  const R = (x, y, w, h, hex, a = 1) => fb.rect(x - ox, y - oy, w, h, C(hex), a);
  fb.rect(0, 0, W, H, C(COLORS.grass));
  R(WATER_X, 0, WORLD_W - WATER_X, WORLD_H, COLORS.water);
  fb.rect(WATER_X - ox, 0, 5, H, C(COLORS.waterFoam), 0.8);
  R(BEACH_X, 0, WATER_X - BEACH_X, WORLD_H, COLORS.sand);
  R(WATER_X - 26, 0, 26, WORLD_H, COLORS.sandWet);
  for (let y = 60; y < WORLD_H; y += 190) R(WATER_X + 90, y, 150, 7, COLORS.waterDeep, 0.7);
  for (const p of piers) {
    R(p.x, p.y, p.w, p.h, COLORS.pier);
    for (let x = p.x + 12; x < p.x + p.w; x += 34) R(x, p.y, 3, p.h, '#000000', 0.18);
  }
  R(runway.x, runway.y, runway.w, runway.h, COLORS.runway);
  for (let x = runway.x + 26; x < runway.x + runway.w - 20; x += 52) {
    R(x, runway.y + runway.h / 2 - 2, 30, 4, COLORS.lane);
  }
  for (const ax of AVENUES) R(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H, COLORS.road);
  for (const sy of STREETS) R(0, sy - ROAD_W / 2, WORLD_W, ROAD_W, COLORS.road);
  for (const ax of AVENUES) {
    for (const sy of STREETS) R(ax - ROAD_W / 2, sy - ROAD_W / 2, ROAD_W, ROAD_W, COLORS.roadDark);
  }
  for (const ax of AVENUES) {
    R(ax - ROAD_W / 2 + 3, 0, 2, WORLD_H, '#ffffff', 0.5);
    R(ax + ROAD_W / 2 - 5, 0, 2, WORLD_H, '#ffffff', 0.5);
    for (let y = 8; y < WORLD_H; y += 40) R(ax - 1.5, y, 3, 18, COLORS.lane);
  }
  for (const sy of STREETS) {
    for (let x = 8; x < WORLD_W; x += 40) R(x, sy - 1.5, 18, 3, COLORS.lane);
  }
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        R(ax + i * 12 - 3, sy - ROAD_W / 2 + 4, 6, 12, '#e8e8e8', 0.55);
        R(ax + i * 12 - 3, sy + ROAD_W / 2 - 16, 6, 12, '#e8e8e8', 0.55);
      }
    }
  }
  for (const b of blocks) {
    if (b.kind === 'park') {
      R(b.x, b.y, b.w, b.h, COLORS.grassDark);
      fb.line(b.x - ox, b.y + b.h / 2 - oy, b.x + b.w - ox, b.y + b.h / 2 - oy, 9, C(COLORS.parkPath));
      fb.line(b.x + b.w / 2 - ox, b.y - oy, b.x + b.w / 2 - ox, b.y + b.h - oy, 9, C(COLORS.parkPath));
    } else if (b.kind === 'lot') {
      R(b.x, b.y, b.w, b.h, COLORS.roadDark);
    } else if (b.kind === 'airfield') {
      R(b.x, b.y, b.w, 60, COLORS.plaza);
    }
  }
  for (const b of buildings) {
    const cx = b.x + b.w / 2 - ox;
    const cy = b.y + b.h / 2 - oy;
    if (cx < -260 || cx > W + 260 || cy < -260 || cy > H + 260) continue;
    R(b.x - 9, b.y - 9, b.w + 18, b.h + 18, COLORS.sidewalk);
    const sh = 6 + b.floors * 5;
    R(b.x + sh, b.y + sh, b.w, b.h, '#14231a', 0.25);
    R(b.x, b.y, b.w, b.h, b.special ? b.color : BUILDING_PALETTES[b.palette][b.ci]);
    const inset = 5 + b.floors;
    R(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2, b.special ? b.roof : ROOF_COLORS[b.ri]);
    const n = Math.min(4, Math.floor((b.w * b.h) / 9000));
    for (let i = 0; i < n; i++) {
      const rx = b.x + inset + 6 + hash2(b.x + i * 31, b.y) * Math.max(4, b.w - inset * 2 - 26);
      const ry = b.y + inset + 6 + hash2(b.x, b.y + i * 47) * Math.max(4, b.h - inset * 2 - 20);
      R(rx, ry, 15, 11, '#000000', 0.16);
    }
    if (b.name) {
      const label = b.name.toUpperCase();
      text(fb, label, cx - textWidth(label, 2) / 2, cy - 7, 2, C('#37404a'));
    }
  }
  for (const p of palms) {
    const x = p.x - ox;
    const y = p.y - oy;
    if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
    fb.circle(x + 7, y + 8, 11 * p.s, C('#14231a'), 0.2);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + p.x * 0.01;
      fb.line(x, y, x + Math.cos(a) * 17 * p.s, y + Math.sin(a) * 17 * p.s + 4, 3, C(COLORS.palmLeaf));
    }
    fb.circle(x, y, 3.4 * p.s, C(COLORS.palmTrunk));
  }
  for (const l of lamps) {
    const x = l.x - ox;
    const y = l.y - oy;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    fb.circle(x, y, 2.6, C('#5a6068'));
  }
}

function rotPoint(cx, cy, angle, lx, ly) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [cx + lx * c - ly * s, cy + lx * s + ly * c];
}

function drawCar(fb, ox, oy, car, sirenFlash) {
  const x = car.x - ox;
  const y = car.y - oy;
  if (x < -80 || x > W + 80 || y < -80 || y > H + 80) return;
  const isCop = car.kind === 'police';
  fb.rotRect(x + 4, y + 5, 40, 21, car.angle, C('#0f140f'), 0.3);
  fb.rotRect(x, y, 40, 21, car.angle, C(isCop ? COLORS.copCarBody : car.color));
  if (isCop) fb.rotRect(x, y, 40, 7, car.angle, C(COLORS.copCarTrim));
  let [gx, gy] = rotPoint(x, y, car.angle, 5, 0);
  fb.rotRect(gx, gy, 8, 16, car.angle, C('#bfe6f2'));
  [gx, gy] = rotPoint(x, y, car.angle, -4, 0);
  fb.rotRect(gx, gy, 11, 17, car.angle, C(isCop ? COLORS.copCarTrim : '#2b3540'));
  [gx, gy] = rotPoint(x, y, car.angle, -11, 0);
  fb.rotRect(gx, gy, 4, 16, car.angle, C('#9fd4e8'));
  for (const [lx, ly] of [[-11, -11], [-11, 11], [11, -11], [11, 11]]) {
    const [wx, wy] = rotPoint(x, y, car.angle, lx, ly);
    fb.rotRect(wx, wy, 9, 4, car.angle, C('#14161a'));
  }
  for (const ly of [-6, 6]) {
    const [hx, hy] = rotPoint(x, y, car.angle, 20, ly);
    fb.circle(hx, hy, 2.4, C(COLORS.headlight));
    const [tx, ty] = rotPoint(x, y, car.angle, -20, ly);
    fb.circle(tx, ty, 2.2, C('#ff4040'));
  }
  if (isCop && sirenFlash !== null) {
    const [lx1, ly1] = rotPoint(x, y, car.angle, -3, 0);
    fb.rotRect(lx1, ly1, 6, 12, car.angle, C(sirenFlash ? COLORS.lightRed : COLORS.lightBlue));
    const [lx2, ly2] = rotPoint(x, y, car.angle, 4, 0);
    fb.rotRect(lx2, ly2, 6, 12, car.angle, C(sirenFlash ? COLORS.lightBlue : COLORS.lightRed));
  }
  if (car.player) {
    const bob = -6;
    fb.poly([[x - 8, y - 44 + bob], [x + 8, y - 44 + bob], [x, y - 34 + bob]], C(COLORS.hudAccent));
  }
}

function drawPed(fb, ox, oy, ped) {
  const x = ped.x - ox;
  const y = ped.y - oy;
  if (x < -30 || x > W + 30 || y < -30 || y > H + 30) return;
  fb.circle(x + 2, y + 4, 7, C('#0f140f'), 0.25);
  fb.circle(x, y, 7, C(ped.color));
  fb.circle(x, y, 3.6, C(ped.skin));
  if (ped.fare) text(fb, '!', x - 3, y - 26, 2, C(COLORS.markerGreen));
}

function drawPlayerFigure(fb, ox, oy, p) {
  const x = p.x - ox;
  const y = p.y - oy;
  fb.circle(x + 2, y + 4, 8, C('#0f140f'), 0.28);
  fb.circle(x, y, 8, C(COLORS.player));
  fb.circle(x, y, 4.2, C(COLORS.playerSkin));
  fb.line(x, y, x + Math.cos(p.angle) * 9, y + Math.sin(p.angle) * 9, 3, C('#37404a'));
}

function drawObjective(fb, ox, oy, o) {
  const x = o.x - ox;
  const y = o.y - oy;
  if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return;
  for (let i = 0; i < 10; i++) {
    fb.rect(x - 7, y - 190 + i * 19, 14, 19, C(COLORS.marker), 0.04 + i * 0.035);
  }
  fb.ring(x, y, 20, 3, C(COLORS.marker));
  fb.poly([[x - 11, y - 58], [x + 11, y - 58], [x, y - 42]], C(COLORS.marker));
}

// ---------- HUD (mirrors hud.js) ----------
function panel(fb, x, y, w, h) {
  fb.rect(x, y, w, h, C('#0a0e14'), 0.62);
}
function star(fb, cx, cy, r, hex) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  fb.poly(pts, C(hex));
}
function drawMinimap(fb, scene) {
  const mw = 204;
  const mh = Math.round((mw * WORLD_H) / WORLD_W);
  const x0 = W - mw - 14;
  const y0 = H - mh - 14;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  fb.rect(x0, y0, mw, mh, C('#3f7a34'));
  fb.rect(x0 + BEACH_X * sx, y0, (WATER_X - BEACH_X) * sx, mh, C(COLORS.sand));
  fb.rect(x0 + WATER_X * sx, y0, (WORLD_W - WATER_X) * sx, mh, C(COLORS.water));
  for (const ax of AVENUES) fb.rect(x0 + ax * sx, y0, 1.4, mh, C('#f0f0f0'), 0.65);
  for (const syLine of STREETS) fb.rect(x0, y0 + syLine * sy, mw, 1.4, C('#f0f0f0'), 0.65);
  for (const b of buildings) {
    fb.rect(x0 + b.x * sx, y0 + b.y * sy, Math.max(1.6, b.w * sx), Math.max(1.6, b.h * sy), C('#1e2228'), 0.5);
  }
  for (const cop of scene.minimapCops ?? []) {
    fb.circle(x0 + cop.x * sx, y0 + cop.y * sy, 3, C(scene.sirenFlash ? '#ff5040' : '#3f8cff'));
  }
  if (scene.objective) {
    fb.circle(x0 + scene.objective.x * sx, y0 + scene.objective.y * sy, 4.4, C(COLORS.marker));
    fb.ring(x0 + scene.objective.x * sx, y0 + scene.objective.y * sy, 7, 1.6, C(COLORS.marker), 0.6);
  }
  const p = scene.playerPos;
  const pts = [[6.5, 0], [-4.5, -4], [-4.5, 4]].map(([lx, ly]) => {
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    return [x0 + p.x * sx + lx * c - ly * s, y0 + p.y * sy + lx * s + ly * c];
  });
  fb.poly(pts, C('#ffffff'));
  fb.rect(x0, y0, mw, 1.6, C('#ffffff'), 0.5);
  fb.rect(x0, y0 + mh - 1.6, mw, 1.6, C('#ffffff'), 0.5);
  fb.rect(x0, y0, 1.6, mh, C('#ffffff'), 0.5);
  fb.rect(x0 + mw - 1.6, y0, 1.6, mh, C('#ffffff'), 0.5);
}

function drawHud(fb, scene) {
  const hud = scene.hud;
  panel(fb, 14, 14, 224, 118);
  text(fb, 'SOLMAR', 26, 26, 2, C(COLORS.hudAccent));
  text(fb, hud.money, 104, 26, 2, C(COLORS.hudText));
  text(fb, hud.clock + ' · DAY ' + hud.day, 26, 52, 2, C('#ffffff'), 0.85);
  text(fb, 'SHELLS ' + hud.shells + '/20  FARES ' + hud.fares, 26, 78, 2, C('#ffffff'), 0.85);
  text(fb, hud.healthLabel, 26, 104, 2, C('#ffffff'), 0.85);
  fb.rect(120, 108, 104, 8, C('#ffffff'), 0.22);
  fb.rect(120, 108, (104 * hud.health) / 100, 8, C(hud.health > 35 ? '#58e08a' : COLORS.hudDanger));
  if (hud.stars > 0) {
    panel(fb, W - 196, 14, 182, 52);
    for (let i = 0; i < 5; i++) {
      star(fb, W - 168 + i * 26, 40, 10, i < hud.stars ? COLORS.star : '#5a6068');
    }
    text(fb, 'WANTED', W - 62, 33, 1, C(COLORS.hudDanger));
  }
  if (hud.banner) {
    panel(fb, W / 2 - 230, 16, 460, 58);
    const t1 = hud.banner.title;
    text(fb, t1, W / 2 - textWidth(t1, 2) / 2, 26, 2, C(COLORS.hudAccent));
    const t2 = hud.banner.sub;
    text(fb, t2, W / 2 - textWidth(t2, 2) / 2, 50, 2, C(COLORS.hudText));
  }
  if (hud.objectiveText) {
    const t = hud.objectiveText;
    const tw = textWidth(t, 2) + 34;
    panel(fb, W / 2 - tw / 2, hud.banner ? 84 : 16, tw, 30);
    fb.circle(W / 2 - tw / 2 + 16, (hud.banner ? 84 : 16) + 15, 5, C(COLORS.marker));
    text(fb, t, W / 2 - textWidth(t, 2) / 2 + 8, (hud.banner ? 84 : 16) + 8, 2, C(COLORS.hudText));
  }
  if (hud.storyLine) {
    const t = hud.storyLine;
    text(fb, t, W / 2 - textWidth(t, 1) / 2, 108, 1, C('#ffffff'), 0.55);
  }
  text(fb, hud.hint, 16, H - 22, 2, C('#ffffff'), 0.6);
  drawMinimap(fb, scene);
  if (hud.dialogue) {
    const boxW = 760;
    const boxH = 108;
    const x = (W - boxW) / 2;
    const y = H - boxH - 46;
    fb.rect(x - 1.5, y - 1.5, boxW + 3, boxH + 3, C(COLORS.hudAccent), 0.5);
    fb.rect(x, y, boxW, boxH, C('#080a10'), 0.88);
    text(fb, hud.dialogue.who, x + 20, y + 14, 2, C(COLORS.hudAccent));
    const lines = wrap(hud.dialogue.text, 58);
    lines.slice(0, 3).forEach((l, i) => text(fb, l, x + 20, y + 40 + i * 24, 2, C(COLORS.hudText)));
    text(fb, 'E >', x + boxW - 52, y + boxH - 20, 2, C('#ffffff'), 0.75);
  }
}

// ---------- scenes ----------
const FOOT_HINT = 'WASD WALK · SHIFT RUN · E ENTER CAR / TALK · F FIGHT · P PAUSE';
const CAR_HINT = 'WASD DRIVE · SPACE HANDBRAKE · E EXIT · P PAUSE · M MUTE';
let pedSeed = 0;
function ped(x, y, fare = false) {
  pedSeed++;
  return { x, y, color: PED_COLORS[pedSeed % PED_COLORS.length], skin: '#e0ac69', fare };
}
function car(x, y, angleDeg, colorIdx, kind = 'traffic') {
  return { x, y, angle: (angleDeg * Math.PI) / 180, color: CAR_COLORS[colorIdx % CAR_COLORS.length], kind, driver: kind === 'parked' ? null : 'traffic' };
}
function copCar(x, y, angleDeg) {
  return { x, y, angle: (angleDeg * Math.PI) / 180, color: '#f2f3f5', kind: 'police', driver: 'police', sirenPhase: 2 };
}

const scenes = [
  {
    file: '01-cover.png',
    minutes: 17 * 60 + 40,
    camX: 1470, camY: 905,
    player: { x: 1570, y: 905, angle: -0.5 },
    playerPos: { x: 1570, y: 905, angle: -0.5 },
    cars: [
      car(1523, 760, -90, 0), car(1477, 1150, 90, 2), car(1200, 1023, 0, 1),
      car(1750, 977, 180, 5), car(1150, 1080, 90, 11, 'parked'),
    ],
    peds: [ped(1565, 700), ped(1430, 1080), ped(1680, 990), ped(1200, 620), ped(1850, 1150), ped(1330, 1200), ped(1568, 762, true)],
    objective: places.diner,
    minimapCops: [],
    sirenFlash: false,
    hud: {
      money: '$25', clock: '17:40', day: 1, shells: 0, fares: 0, health: 100, healthLabel: 'HEALTH',
      stars: 0, objectiveText: "GO TO ROSA'S DINER · 74M", storyLine: 'STORY 1/5 - HOMECOMING', hint: FOOT_HINT,
    },
  },
  {
    file: '02-chase.png',
    minutes: 15 * 60 + 20,
    camX: 1900, camY: 1180,
    player: null,
    playerPos: { x: 1923, y: 1180, angle: -Math.PI / 2 },
    cars: [
      { ...car(1923, 1180, -90, 0), player: true, driver: 'player' },
      copCar(1906, 1305, -90), copCar(1962, 1425, -78),
      car(1877, 900, 90, 1), car(2150, 1373, 0, 4),
    ],
    peds: [ped(1600, 900), ped(2250, 1250), ped(2050, 860)],
    skids: [{ x: 1923, y: 1245 }, { x: 1925, y: 1290 }, { x: 1920, y: 1335 }],
    objective: places.chopShop,
    minimapCops: [{ x: 1906, y: 1305 }, { x: 1962, y: 1425 }],
    sirenFlash: true,
    hud: {
      money: '$75', clock: '15:20', day: 1, shells: 0, fares: 0, health: 82, healthLabel: 'CAR',
      stars: 3, objectiveText: "DELIVER THE CAR TO DEX'S CHOP SHOP · 173M", storyLine: 'STORY 2/5 - FIRST WHEELS', hint: CAR_HINT,
    },
  },
  {
    file: '03-night-run.png',
    minutes: 23 * 60 + 20,
    camX: 3160, camY: 2070,
    player: { x: 3480, y: 2125, angle: Math.PI },
    playerPos: { x: 3480, y: 2125, angle: Math.PI },
    cars: [
      { ...car(3235, 2195, 0, 2, 'parked'), lightsOn: true },
      copCar(3097, 1750, 180),
    ],
    peds: [ped(3410, 2112), ped(3300, 2330)],
    objective: places.warehouse,
    minimapCops: [{ x: 3097, y: 1750 }],
    sirenFlash: true,
    hud: {
      money: '$225', clock: '23:20', day: 1, shells: 0, fares: 0, health: 100, healthLabel: 'HEALTH',
      stars: 2, objectiveText: 'DELIVER THE CARGO TO PORT WAREHOUSE 9 · 300M', storyLine: 'STORY 3/5 - NIGHT RUN', hint: FOOT_HINT,
      dialogue: { who: 'DEX (PHONE)', text: "CARGO IS ON THE PIER, MARLO. CLOCK IS RUNNING. GET IT TO WAREHOUSE 9 BEFORE THE HEAT FINDS YOU." },
    },
  },
  {
    file: '04-beach-run.png',
    minutes: 11 * 60 + 15,
    camX: 3050, camY: 760,
    player: null,
    playerPos: { x: 3097, y: 700, angle: Math.PI / 2 },
    cars: [
      { ...car(3097, 700, 90, 2), player: true, driver: 'player' },
      car(3143, 470, -90, 3), car(2723, 950, -90, 5),
    ],
    peds: [ped(3380, 600), ped(3420, 900), ped(3212, 820)],
    objective: { x: 3120, y: 1000 },
    minimapCops: [],
    sirenFlash: false,
    hud: {
      money: '$625', clock: '11:15', day: 2, shells: 3, fares: 2, health: 96, healthLabel: 'CAR',
      stars: 0, objectiveText: 'CHECKPOINT 4/6 - 38S', storyLine: 'STORY 4/5 - HEAT WAVE', hint: CAR_HINT,
    },
  },
];

function renderScene(scene) {
  const fb = new FB(W, H);
  const ox = scene.camX - W / 2;
  const oy = scene.camY - H / 2;
  drawWorld(fb, ox, oy);
  for (const s of scene.skids ?? []) {
    fb.rotRect(s.x - ox, s.y - oy, 14, 5, -Math.PI / 2, C('#0f1012'), 0.4);
  }
  if (scene.objective) drawObjective(fb, ox, oy, scene.objective);
  for (const c of scene.cars) drawCar(fb, ox, oy, c, c.kind === 'police' ? scene.sirenFlash : null);
  for (const p of scene.peds) drawPed(fb, ox, oy, p);
  if (scene.player) drawPlayerFigure(fb, ox, oy, scene.player);
  if (scene.playerPos && !scene.player) {
    // player is in a car: nothing extra, the chevron rides the car
  }
  const dusk = duskFactor(scene.minutes);
  const night = nightFactor(scene.minutes);
  if (dusk > 0.02) fb.darken(C('#ff7436'), dusk * 0.13);
  if (night > 0.02) {
    fb.darken(C('#090c2e'), night * 0.52);
    for (const l of lamps) {
      const x = l.x - ox;
      const y = l.y - oy;
      if (x > -70 && x < W + 70 && y > -70 && y < H + 70) fb.glow(x, y, 62, C('#ffc45a'), 0.3 * night);
    }
    for (const c of scene.cars) {
      if (c.driver || c.lightsOn) {
        const hx = c.x - ox + Math.cos(c.angle) * 60;
        const hy = c.y - oy + Math.sin(c.angle) * 60;
        fb.glow(hx, hy, 66, C('#ffc45a'), 0.28 * night);
      }
      if (c.kind === 'police') {
        fb.glow(c.x - ox, c.y - oy, 46, C(scene.sirenFlash ? '#ff3c32' : '#326eff'), 0.22 * night);
      }
    }
    fb.glow(scene.playerPos.x - ox, scene.playerPos.y - oy, 120, C('#ffc45a'), 0.14 * night);
  }
  drawHud(fb, scene);
  return fb;
}

mkdirSync(join(root, 'screenshots'), { recursive: true });
for (const scene of scenes) {
  const png = encodePng(renderScene(scene));
  writeFileSync(join(root, 'screenshots', scene.file), png);
  console.log(scene.file, png.length, 'bytes', png.length <= 262144 ? 'OK' : 'OVER 256 KiB!');
}
