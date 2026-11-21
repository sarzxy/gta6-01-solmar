// police.js — Solmar PD: the wanted level, who saw what, patrol cars that hunt
// the player, foot cops who make the arrest, and the shooting that starts at
// three stars. Busted and wasted are decided here and resolved by main.
import { AVENUES, STREETS, places } from './world.js';
import { angleDelta, clamp, dist } from './util.js';
import { makeCar } from './vehicles.js';
import { scarePeds } from './peds.js';

export function createWanted() {
  return { level: 0, unseenTimer: 0, seen: false };
}

export function starsOf(wanted) {
  if (wanted.level <= 0.05) return 0;
  return Math.min(5, Math.ceil(wanted.level));
}

// A crime raises the wanted level by the full amount when a pedestrian or an
// officer is close enough to see it, and by a third when nobody saw a thing.
export function commitCrime(state, points, x, y) {
  let witnessed = false;
  for (const ped of state.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < 280) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const cop of state.cops) {
      if (dist(cop.x, cop.y, x, y) < 540) { witnessed = true; break; }
    }
  }
  const w = state.wanted;
  w.level = clamp(w.level + (witnessed ? points : points * 0.34), 0, 5);
  if (witnessed) w.unseenTimer = 0;
  scarePeds(state, x, y, 170);
  return witnessed;
}

function spawnPoint(state) {
  // A road point a few blocks from the player, out of direct sight.
  const p = state.player;
  const options = [];
  for (const ax of AVENUES) for (const sy of STREETS) {
    const d = dist(ax, sy, p.x, p.y);
    if (d > 560 && d < 900) options.push({ x: ax, y: sy });
  }
  if (options.length === 0) return { x: p.x + 600, y: p.y };
  return options[Math.floor(state.rng() * options.length)];
}

export function updatePolice(state, dt) {
  const w = state.wanted;
  const player = state.player;
  const stars = starsOf(w);
  // Sight: any officer within 430 counts as eyes on the player.
  let seen = false;
  for (const cop of state.cops) {
    if (dist(cop.x, cop.y, player.x, player.y) < 430) { seen = true; break; }
  }
  if (!seen) {
    for (const foot of state.footCops) {
      if (dist(foot.x, foot.y, player.x, player.y) < 300) { seen = true; break; }
    }
  }
  w.seen = seen;
  if (seen) w.unseenTimer = 0;
  else {
    w.unseenTimer += dt;
    if (w.unseenTimer > 8 && w.level > 0) {
      w.level = Math.max(0, w.level - dt * 0.14);
    }
  }

  // Fleet size follows the stars; surplus cars give up and drive off.
  const desired = stars === 0 ? 0 : Math.min(2 + stars, 6);
  if (state.cops.length < desired) {
    const spot = spawnPoint(state);
    const car = makeCar(spot.x, spot.y, 0, '#f2f3f5', 'police');
    car.driver = 'police';
    state.cars.push(car);
    state.cops.push(car);
  }
  for (let i = state.cops.length - 1; i >= 0; i--) {
    const cop = state.cops[i];
    const d = dist(cop.x, cop.y, player.x, player.y);
    if ((stars === 0 && d > 700) || d > 1700) {
      state.cars.splice(state.cars.indexOf(cop), 1);
      state.cops.splice(i, 1);
      continue;
    }
    driveCop(state, cop, dt, d);
  }
  updateFootCops(state, dt, stars);
  // From three stars the police shoot: the car soaks most of it, the player
  // the rest when they are on foot.
  if (stars >= 3 && seen) {
    const dps = 4.5 * (stars - 2);
    if (player.car) player.car.health -= dps * 0.5 * dt;
    else player.health -= dps * dt;
    if (Math.random() < dt * 5) {
      const cop = state.cops[Math.floor(Math.random() * state.cops.length)];
      if (cop) state.effects.push({ type: 'flash', x: cop.x, y: cop.y, vx: 0, vy: 0, life: 0.07, maxLife: 0.07, size: 9 });
    }
  }
}

function driveCop(state, cop, dt, d) {
  const player = state.player;
  const lead = player.car ? 0.45 : 0.15;
  const tx = player.x + (player.vx ?? 0) * lead;
  const ty = player.y + (player.vy ?? 0) * lead;
  const want = Math.atan2(ty - cop.y, tx - cop.x);
  const delta = angleDelta(cop.angle, want);
  cop.controls.steer = clamp(delta * 2.6, -1, 1);
  if (d > 78) {
    cop.controls.throttle = 1;
  } else if (d > 40) {
    cop.controls.throttle = Math.abs(delta) > 2.2 ? -0.6 : 0.45;
  } else {
    cop.controls.throttle = 0;
    cop.controls.brake = cop.speed > 30 ? 1 : 0;
    // Close on foot: an officer gets out and makes the arrest on foot.
    if (!player.car && !cop.footCop && state.footCops.length < 3) {
      const foot = {
        x: cop.x + 14, y: cop.y + 10, angle: 0, speed: 0, car: cop,
        color: '#274bdb', skin: '#e0ac69', grabTimer: 0, walkPhase: 0,
      };
      cop.footCop = foot;
      state.footCops.push(foot);
    }
  }
  cop.sirenPhase += dt * 7;
}

// Foot officers run the player down; standing in reach while the player is
// slow fills the arrest. If the player drives off, the officers give up.
function updateFootCops(state, dt, stars) {
  const player = state.player;
  for (let i = state.footCops.length - 1; i >= 0; i--) {
    const foot = state.footCops[i];
    if (player.car || stars === 0) {
      if (foot.car) foot.car.footCop = null;
      state.footCops.splice(i, 1);
      continue;
    }
    const d = dist(foot.x, foot.y, player.x, player.y);
    const want = Math.atan2(player.y - foot.y, player.x - foot.x);
    foot.angle = want;
    if (d > 16) {
      foot.speed = 208;
      foot.x += Math.cos(want) * foot.speed * dt;
      foot.y += Math.sin(want) * foot.speed * dt;
      foot.walkPhase += dt * 11;
      foot.grabTimer = Math.max(0, foot.grabTimer - dt * 2);
    } else {
      foot.speed = 0;
      if (Math.abs(player.speed) < 70) {
        foot.grabTimer += dt;
        state.bustedMeter = Math.min(1, foot.grabTimer / 1.15);
        if (foot.grabTimer >= 1.15) state.pendingBusted = true;
      }
    }
    if (d > 620) {
      if (foot.car) foot.car.footCop = null;
      state.footCops.splice(i, 1);
    }
  }
  if (state.footCops.length === 0) state.bustedMeter = Math.max(0, state.bustedMeter - dt * 0.8);
}

// Where the player wakes up after an arrest or a hospital visit.
export function respawnPoint() {
  return { x: places.hospital.x, y: places.hospital.y + 26 };
}
