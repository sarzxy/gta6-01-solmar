// peds.js — the people of Solmar: they stroll the sidewalks, run from trouble,
// hail the player for fares, and go down when a car finds them.
import { collideCircle, groundAt } from './world.js';
import { PED_COLORS } from './theme.js';
import { angleLerp, choice, dist, makeRng, randRange } from './util.js';

export function createPeds() {
  const rng = makeRng(4242);
  const peds = [];
  for (let i = 0; i < 26; i++) {
    // Sidewalk-ish spawn: near a road but not on it, never inside a building.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = randRange(rng, 120, 3150);
      y = randRange(rng, 120, 2480);
      const [cx, cy, hit] = collideCircle(x, y, 12);
      if (!hit && groundAt(cx, cy) === 'land') { x = cx; y = cy; break; }
    }
    peds.push({
      x, y, angle: rng() * Math.PI * 2, speed: 0,
      tx: x, ty: y, state: 'walk', color: choice(rng, PED_COLORS),
      skin: choice(rng, ['#f1c27d', '#e0ac69', '#c68863', '#8d5524', '#ffdbac']),
      health: 100, downTimer: 0, fleeX: 0, fleeY: 0, fleeT: 0,
      fare: false, walkPhase: rng() * 6,
    });
  }
  return peds;
}

export function scarePeds(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeX = x;
      ped.fleeY = y;
      ped.fleeT = 2.2;
    }
  }
}

export function updatePeds(state, dt) {
  const rng = state.rng;
  for (const ped of state.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0 && ped.health > 0) ped.state = 'walk';
      continue;
    }
    if (ped.fare) {
      ped.speed = 0; // waiting at the kerb for a ride
      continue;
    }
    let tx;
    let ty;
    let speed;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) ped.state = 'walk';
      const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      tx = ped.x + Math.cos(away) * 120;
      ty = ped.y + Math.sin(away) * 120;
      speed = 205;
    } else {
      if (dist(ped.x, ped.y, ped.tx, ped.ty) < 14 || rng() < dt * 0.02) {
        // New stroll target: a nearby point on land (sidewalks and plazas).
        for (let tries = 0; tries < 12; tries++) {
          const nx = ped.x + randRange(rng, -320, 320);
          const ny = ped.y + randRange(rng, -320, 320);
          const [, , hit] = collideCircle(nx, ny, 12);
          if (!hit && groundAt(nx, ny) !== 'water') { ped.tx = nx; ped.ty = ny; break; }
        }
      }
      tx = ped.tx;
      ty = ped.ty;
      speed = 68;
    }
    const want = Math.atan2(ty - ped.y, tx - ped.x);
    ped.angle = angleLerp(ped.angle, want, dt * 8);
    ped.speed = speed;
    ped.walkPhase += dt * (speed / 14);
    let nx = ped.x + Math.cos(ped.angle) * speed * dt;
    let ny = ped.y + Math.sin(ped.angle) * speed * dt;
    [nx, ny] = collideCircle(nx, ny, 9);
    ped.x = nx;
    ped.y = ny;
    // Cars are bad news: a fast one close by knocks a pedestrian down.
    for (const car of state.cars) {
      if (Math.abs(car.speed) < 55) continue;
      if (dist(ped.x, ped.y, car.x, car.y) < 21) {
        ped.health -= Math.abs(car.speed) * 0.22;
        ped.state = 'down';
        ped.downTimer = ped.health > 0 ? 5 : 9999;
        state.events.push({ type: 'pedHit', x: ped.x, y: ped.y, car, fatal: ped.health <= 0 });
        scarePeds(state, ped.x, ped.y, 200);
        break;
      }
    }
  }
}
