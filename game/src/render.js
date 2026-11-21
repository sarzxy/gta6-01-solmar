// render.js — draws Solmar to the canvas: ground, roads, buildings with sun
// shadows, palms, traffic, people, the police, and the night with its lights.
// Everything is flat-shaded vector drawing; there are no image assets.
import {
  AVENUES, BEACH_X, ROAD_W, STREETS, WATER_X, WORLD_H, WORLD_W,
  blocks, buildings, lamps, palms, piers, places, runway, shellSpots,
} from './world.js';
import { BUILDING_PALETTES, COLORS, ROOF_COLORS, duskFactor, nightFactor } from './theme.js';
import { clamp, dist } from './util.js';

function hash2(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function render(ctx, state) {
  const { w, h } = state.view;
  const cam = state.camera;
  const night = nightFactor(state.minutes);
  const dusk = duskFactor(state.minutes);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawGround(ctx, state, cam, w, h);
  drawBlocks(ctx, cam, w, h);
  drawBuildings(ctx, cam, w, h, night);
  drawPalms(ctx, cam, w, h);
  drawShells(ctx, state, cam, w, h);
  drawSkids(ctx, state);
  drawObjectiveMarker(ctx, state);
  for (const car of state.cars) drawCar(ctx, state, car, night);
  for (const ped of state.peds) drawPed(ctx, ped, false);
  for (const foot of state.footCops) drawPed(ctx, foot, true);
  if (!state.player.car) drawPlayer(ctx, state);
  drawEffects(ctx, state);
  ctx.restore();
  // Night and dusk wash, then the lights punched back through it.
  if (dusk > 0.02) {
    ctx.fillStyle = `rgba(255,116,54,${(dusk * 0.13).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (night > 0.02) {
    ctx.fillStyle = `rgba(9,12,46,${(night * 0.52).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawLights(ctx, state, cam, w, h, night);
    ctx.restore();
  }
}

function inView(cam, w, h, x, y, pad) {
  return x > cam.x - pad && x < cam.x + w + pad && y > cam.y - pad && y < cam.y + h + pad;
}

function drawGround(ctx, state, cam, w, h) {
  const t = state.timeSeconds;
  // Water with a slow foam line at the shore.
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  ctx.fillStyle = COLORS.waterDeep;
  for (let y = 60; y < WORLD_H; y += 190) {
    ctx.fillRect(WATER_X + 90 + Math.sin(t * 0.4 + y) * 14, y, 150, 7);
  }
  ctx.fillStyle = COLORS.waterFoam;
  const foamX = WATER_X + Math.sin(t * 0.8) * 5;
  ctx.fillRect(foamX, 0, 5, WORLD_H);
  // Sand.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X, WORLD_H);
  ctx.fillStyle = COLORS.sandWet;
  ctx.fillRect(WATER_X - 26, 0, 26, WORLD_H);
  // Marina piers.
  for (const p of piers) {
    ctx.fillStyle = COLORS.pier;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = p.x + 12; x < p.x + p.w; x += 34) ctx.fillRect(x, p.y, 3, p.h);
  }
  // Airfield runway.
  ctx.fillStyle = COLORS.runway;
  ctx.fillRect(runway.x, runway.y, runway.w, runway.h);
  ctx.fillStyle = COLORS.lane;
  for (let x = runway.x + 26; x < runway.x + runway.w - 20; x += 52) {
    ctx.fillRect(x, runway.y + runway.h / 2 - 2, 30, 4);
  }
  // Roads: asphalt, edge lines, dashed centre lines, crosswalks.
  ctx.fillStyle = COLORS.road;
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2, WORLD_W, ROAD_W);
  ctx.fillStyle = COLORS.roadDark;
  for (const ax of AVENUES) for (const sy of STREETS) ctx.fillRect(ax - ROAD_W / 2, sy - ROAD_W / 2, ROAD_W, ROAD_W);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const ax of AVENUES) {
    ctx.moveTo(ax - ROAD_W / 2 + 3, 0);
    ctx.lineTo(ax - ROAD_W / 2 + 3, WORLD_H);
    ctx.moveTo(ax + ROAD_W / 2 - 3, 0);
    ctx.lineTo(ax + ROAD_W / 2 - 3, WORLD_H);
  }
  ctx.stroke();
  ctx.strokeStyle = COLORS.lane;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const ax of AVENUES) {
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, WORLD_H);
  }
  for (const sy of STREETS) {
    ctx.moveTo(0, sy);
    ctx.lineTo(WORLD_W, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232,232,232,0.55)';
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        ctx.fillRect(ax + i * 12 - 3, sy - ROAD_W / 2 + 4, 6, 12);
        ctx.fillRect(ax + i * 12 - 3, sy + ROAD_W / 2 - 16, 6, 12);
      }
    }
  }
  void cam;
  void w;
  void h;
}

function drawBlocks(ctx, cam, w, h) {
  for (const b of blocks) {
    if (!inView(cam, w, h, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    if (b.kind === 'park') {
      ctx.fillStyle = COLORS.grassDark;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = COLORS.parkPath;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h / 2);
      ctx.lineTo(b.x + b.w, b.y + b.h / 2);
      ctx.moveTo(b.x + b.w / 2, b.y);
      ctx.lineTo(b.x + b.w / 2, b.y + b.h);
      ctx.stroke();
    } else if (b.kind === 'lot') {
      ctx.fillStyle = COLORS.roadDark;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    } else if (b.kind === 'airfield') {
      ctx.fillStyle = COLORS.plaza;
      ctx.fillRect(b.x, b.y, b.w, 60);
    }
  }
}

function drawBuildings(ctx, cam, w, h, night) {
  for (const b of buildings) {
    if (!inView(cam, w, h, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) + 90)) continue;
    // Sidewalk pad.
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(b.x - 9, b.y - 9, b.w + 18, b.h + 18);
    ctx.fillStyle = COLORS.sidewalkEdge;
    ctx.fillRect(b.x - 9, b.y + b.h + 5, b.w + 18, 4);
    // Sun shadow, longer for taller buildings.
    const sh = 6 + b.floors * 5;
    ctx.fillStyle = 'rgba(20,30,20,0.25)';
    ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
    // Walls (a sliver) and roof.
    const color = b.special ? b.color : BUILDING_PALETTES[b.palette][b.ci];
    ctx.fillStyle = color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const inset = 5 + b.floors;
    ctx.fillStyle = b.special ? b.roof : ROOF_COLORS[b.ri];
    ctx.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);
    // Roof furniture: AC units and a water tank on the tall ones.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    const n = Math.min(4, Math.floor((b.w * b.h) / 9000));
    for (let i = 0; i < n; i++) {
      const rx = b.x + inset + 6 + hash2(b.x + i * 31, b.y) * Math.max(4, b.w - inset * 2 - 26);
      const ry = b.y + inset + 6 + hash2(b.x, b.y + i * 47) * Math.max(4, b.h - inset * 2 - 20);
      ctx.fillRect(rx, ry, 15, 11);
    }
    if (night > 0.35 && b.floors >= 3) {
      // Lit windows around the roofline after dark.
      ctx.fillStyle = 'rgba(255,214,110,0.85)';
      const step = 17;
      for (let x = b.x + 8; x < b.x + b.w - 8; x += step) {
        if (hash2(x, b.y) > 0.45) ctx.fillRect(x, b.y + 3, 5, 3);
        if (hash2(x, b.y + b.h) > 0.45) ctx.fillRect(x, b.y + b.h - 6, 5, 3);
      }
    }
    if (b.name) {
      ctx.fillStyle = '#37404a';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
}

function drawPalms(ctx, cam, w, h) {
  for (const p of palms) {
    if (!inView(cam, w, h, p.x, p.y, 60)) continue;
    ctx.fillStyle = 'rgba(20,30,20,0.2)';
    ctx.beginPath();
    ctx.ellipse(p.x + 7, p.y + 8, 13 * p.s, 6 * p.s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.palmLeaf;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + p.x * 0.01;
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(
        p.x + Math.cos(a) * 11 * p.s, p.y + Math.sin(a) * 11 * p.s - 3,
        p.x + Math.cos(a) * 17 * p.s, p.y + Math.sin(a) * 17 * p.s + 4,
      );
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.palmTrunk;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.4 * p.s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShells(ctx, state, cam, w, h) {
  ctx.fillStyle = '#fff5f8';
  for (let i = 0; i < shellSpots.length; i++) {
    if (state.shellsFound.has(i)) continue;
    const s = shellSpots[i];
    if (!inView(cam, w, h, s.x, s.y, 30)) continue;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e5989b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSkids(ctx, state) {
  ctx.fillStyle = 'rgba(15,15,18,0.4)';
  for (const s of state.skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillRect(-7, -2.5, 14, 5);
    ctx.restore();
  }
}

function drawObjectiveMarker(ctx, state) {
  const o = state.objective;
  if (!o) return;
  const bob = Math.sin(state.timeSeconds * 4) * 6;
  // A pillar of light so the goal reads from anywhere on the street.
  const grad = ctx.createLinearGradient(0, o.y - 190, 0, o.y);
  grad.addColorStop(0, 'rgba(255,210,63,0)');
  grad.addColorStop(1, 'rgba(255,210,63,0.4)');
  ctx.fillStyle = grad;
  ctx.fillRect(o.x - 7, o.y - 190, 14, 190);
  ctx.strokeStyle = COLORS.marker;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(o.x, o.y, 20 + Math.sin(state.timeSeconds * 4) * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLORS.marker;
  ctx.beginPath();
  ctx.moveTo(o.x - 11, o.y - 58 + bob);
  ctx.lineTo(o.x + 11, o.y - 58 + bob);
  ctx.lineTo(o.x, o.y - 42 + bob);
  ctx.closePath();
  ctx.fill();
}

export function drawCarShape(ctx, car, night, sirenOn) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = 'rgba(15,20,15,0.3)';
  ctx.fillRect(-16, -6, 40, 21);
  ctx.rotate(car.angle);
  const isCop = car.kind === 'police';
  // Body.
  ctx.fillStyle = isCop ? COLORS.copCarBody : car.color;
  roundRect(ctx, -20, -10.5, 40, 21, 6);
  ctx.fill();
  if (isCop) {
    ctx.fillStyle = COLORS.copCarTrim;
    ctx.fillRect(-20, -3.5, 40, 7);
  }
  // Cabin and glass.
  ctx.fillStyle = '#bfe6f2';
  ctx.fillRect(1, -8, 8, 16);
  ctx.fillStyle = isCop ? COLORS.copCarTrim : shade(car.color, -28);
  roundRect(ctx, -9, -8.5, 11, 17, 3);
  ctx.fill();
  ctx.fillStyle = '#9fd4e8';
  ctx.fillRect(-13, -8, 4, 16);
  // Wheels.
  ctx.fillStyle = '#14161a';
  ctx.fillRect(-15, -12.5, 9, 4);
  ctx.fillRect(-15, 8.5, 9, 4);
  ctx.fillRect(7, -12.5, 9, 4);
  ctx.fillRect(7, 8.5, 9, 4);
  // Lights.
  ctx.fillStyle = COLORS.headlight;
  ctx.fillRect(18.5, -8, 2.6, 5);
  ctx.fillRect(18.5, 3, 2.6, 5);
  ctx.fillStyle = '#ff4040';
  ctx.fillRect(-21, -8, 2.4, 5);
  ctx.fillRect(-21, 3, 2.4, 5);
  if (isCop && sirenOn) {
    const phase = Math.sin(car.sirenPhase) > 0;
    ctx.fillStyle = phase ? COLORS.lightRed : COLORS.lightBlue;
    ctx.fillRect(-6, -6, 6, 12);
    ctx.fillStyle = phase ? COLORS.lightBlue : COLORS.lightRed;
    ctx.fillRect(1, -6, 6, 12);
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(30,30,30,0.45)';
    roundRect(ctx, -20, -10.5, 40, 21, 6);
    ctx.fill();
  }
  ctx.restore();
  void night;
}

function drawCar(ctx, state, car, night) {
  if (!inView(state.camera, state.view.w, state.view.h, car.x, car.y, 90)) return;
  drawCarShape(ctx, car, night, car.driver === 'police');
  if (car === state.player.car) {
    // A small chevron so the player always finds their own car.
    ctx.fillStyle = COLORS.hudAccent;
    const bob = Math.sin(state.timeSeconds * 5) * 3;
    ctx.beginPath();
    ctx.moveTo(car.x - 8, car.y - 44 + bob);
    ctx.lineTo(car.x + 8, car.y - 44 + bob);
    ctx.lineTo(car.x, car.y - 34 + bob);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPed(ctx, ped, isCop) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(15,20,15,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(Math.PI / 2);
  }
  const bob = ped.state === 'down' ? 0 : Math.abs(Math.sin(ped.walkPhase)) * 1.6;
  ctx.fillStyle = isCop ? COLORS.cop : ped.color;
  ctx.beginPath();
  ctx.arc(0, -bob * 0.3, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -bob * 0.3, 3.6, 0, Math.PI * 2);
  ctx.fill();
  if (ped.fare) {
    ctx.fillStyle = COLORS.markerGreen;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -16 - bob);
  }
  if (isCop) {
    ctx.fillStyle = '#10151c';
    ctx.fillRect(-4, -5 - bob * 0.3, 8, 3);
  }
  ctx.restore();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(15,20,15,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.abs(Math.sin(p.walkPhase)) * 1.8;
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(0, -bob * 0.3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.playerSkin;
  ctx.beginPath();
  ctx.arc(0, -bob * 0.3, 4.2, 0, Math.PI * 2);
  ctx.fill();
  // Facing: cap brim, and the pistol when it is out.
  ctx.strokeStyle = '#37404a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(p.angle) * 9, Math.sin(p.angle) * 9);
  ctx.stroke();
  if (p.hasPistol && state.input.mouse.down) {
    ctx.strokeStyle = '#14161a';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.angle) * 8, Math.sin(p.angle) * 8);
    ctx.lineTo(Math.cos(p.angle) * 17, Math.sin(p.angle) * 17);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEffects(ctx, state) {
  for (const e of state.effects) {
    const a = clamp(e.life / e.maxLife, 0, 1);
    if (e.type === 'smoke') {
      ctx.fillStyle = `rgba(90,90,95,${(a * 0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * (1.6 - a * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'flash') {
      ctx.fillStyle = `rgba(255,220,90,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * a + 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'spark' || e.type === 'burst') {
      ctx.fillStyle = e.type === 'burst' ? `rgba(255,120,40,${a.toFixed(3)})` : `rgba(255,240,180,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * a + 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'swing') {
      ctx.strokeStyle = `rgba(255,255,255,${(a * 0.7).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawLights(ctx, state, cam, w, h, night) {
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, strength) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,196,90,${(strength * night).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,196,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const l of lamps) {
    if (inView(cam, w, h, l.x, l.y, 120)) glow(l.x, l.y, 62, 0.32);
  }
  for (const car of state.cars) {
    if (!inView(cam, w, h, car.x, car.y, 160)) continue;
    if (Math.abs(car.speed) > 4 || car.driver) {
      const hx = car.x + Math.cos(car.angle) * 60;
      const hy = car.y + Math.sin(car.angle) * 60;
      glow(hx, hy, 66, 0.3);
    }
    if (car.kind === 'police') {
      const phase = Math.sin(car.sirenPhase) > 0;
      ctx.fillStyle = phase ? 'rgba(255,60,50,0.20)' : 'rgba(50,110,255,0.20)';
      ctx.beginPath();
      ctx.arc(car.x, car.y, 46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const p = state.player;
  glow(p.x, p.y, 120, 0.16);
  ctx.globalCompositeOperation = 'source-over';
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 0xff) + amt, 0, 255);
  const b = clamp((n & 0xff) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

// Distance helper re-exported for the HUD's marker edge arrows.
export function markerDistance(state, x, y) {
  return Math.round(dist(state.player.x, state.player.y, x, y) / 10);
}

export { places };
