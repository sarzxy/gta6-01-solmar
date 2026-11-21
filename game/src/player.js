// player.js — Marlo Reyes: walking, running, stealing and driving cars, and
// fighting — fists, and Rosa's pistol once the story hands it over.
import { collideCircle, places } from './world.js';
import { angleLerp, clamp, dist } from './util.js';
import { keyDown, keyPressed } from './input.js';
import { commitCrime } from './police.js';
import { scarePeds } from './peds.js';

export function createPlayer(saved) {
  const start = saved?.player ?? { x: places.home.x, y: places.home.y };
  return {
    x: start.x, y: start.y, vx: 0, vy: 0, angle: -Math.PI / 2, speed: 0,
    health: 100, car: null, walkPhase: 0, attackCd: 0, hasPistol: false,
    radius: 10,
  };
}

export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function updatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;
  p.attackCd = Math.max(0, p.attackCd - dt);
  if (p.car) {
    updateDriving(state, dt);
    return;
  }
  // On foot.
  let mx = 0;
  let my = 0;
  if (keyDown(input, 'KeyW', 'ArrowUp')) my -= 1;
  if (keyDown(input, 'KeyS', 'ArrowDown')) my += 1;
  if (keyDown(input, 'KeyA', 'ArrowLeft')) mx -= 1;
  if (keyDown(input, 'KeyD', 'ArrowRight')) mx += 1;
  const running = keyDown(input, 'ShiftLeft', 'ShiftRight');
  const moving = mx !== 0 || my !== 0;
  const speed = running ? 238 : 148;
  if (moving) {
    const len = Math.hypot(mx, my);
    p.vx = (mx / len) * speed;
    p.vy = (my / len) * speed;
    p.angle = angleLerp(p.angle, Math.atan2(my, mx), dt * 14);
    p.walkPhase += dt * (running ? 13 : 9);
  } else {
    p.vx = 0;
    p.vy = 0;
  }
  p.speed = Math.hypot(p.vx, p.vy);
  let nx = p.x + p.vx * dt;
  let ny = p.y + p.vy * dt;
  [nx, ny] = collideCircle(nx, ny, p.radius);
  p.x = nx;
  p.y = ny;

  // Aim with the mouse while it is held; face movement otherwise.
  if (input.mouse.down) {
    const wx = state.camera.x + input.mouse.x;
    const wy = state.camera.y + input.mouse.y;
    p.angle = Math.atan2(wy - p.y, wx - p.x);
    if (p.hasPistol && p.attackCd <= 0) shoot(state);
  }
  if (keyPressed(input, 'KeyF') && p.attackCd <= 0) melee(state);
  if (keyPressed(input, 'KeyE')) {
    const car = nearestCar(state, p.x, p.y, 46);
    if (car) enterCar(state, car);
  }
  // Slow health regen while out of trouble.
  if (state.wanted.level <= 0.05 && p.health > 0) {
    p.health = Math.min(100, p.health + dt * 1.6);
  }
}

function updateDriving(state, dt) {
  const p = state.player;
  const input = state.input;
  const car = p.car;
  car.controls.throttle = 0;
  car.controls.brake = 0;
  car.controls.steer = 0;
  if (keyDown(input, 'KeyW', 'ArrowUp')) car.controls.throttle = 1;
  if (keyDown(input, 'KeyS', 'ArrowDown')) car.controls.throttle = -1;
  if (keyDown(input, 'KeyA', 'ArrowLeft')) car.controls.steer = -1;
  if (keyDown(input, 'KeyD', 'ArrowRight')) car.controls.steer = 1;
  if (keyDown(input, 'Space')) car.controls.brake = 1;
  p.x = car.x;
  p.y = car.y;
  p.vx = Math.cos(car.angle) * car.speed;
  p.vy = Math.sin(car.angle) * car.speed;
  p.speed = Math.abs(car.speed);
  p.angle = car.angle;
  if (keyPressed(input, 'KeyE') && Math.abs(car.speed) < 25) {
    // Step out beside the car.
    car.driver = null;
    if (car.kind !== 'police') car.kind = 'parked';
    p.car = null;
    const side = car.angle + Math.PI / 2;
    let nx = car.x + Math.cos(side) * 26;
    let ny = car.y + Math.sin(side) * 26;
    [nx, ny] = collideCircle(nx, ny, p.radius);
    p.x = nx;
    p.y = ny;
    state.audio.door();
  }
  if (car.dead) {
    p.car = null;
    car.driver = null;
    p.health -= 12;
    state.audio.crash(1);
  }
}

function enterCar(state, car) {
  const p = state.player;
  const wasTraffic = car.kind === 'traffic' && car.driver === 'traffic';
  const wasParked = car.kind === 'parked';
  if (car.kind === 'police') {
    // Stealing a patrol car takes it out of the fleet's hands.
    const i = state.cops.indexOf(car);
    if (i >= 0) state.cops.splice(i, 1);
    if (car.footCop) {
      const fi = state.footCops.indexOf(car.footCop);
      if (fi >= 0) state.footCops.splice(fi, 1);
      car.footCop = null;
    }
    commitCrime(state, 1.4, car.x, car.y);
    state.toast = 'You stole a patrol car. Bold.';
  }
  car.driver = 'player';
  car.kind = car.kind === 'police' ? 'police' : 'player';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  state.audio.door();
  if (wasParked) {
    commitCrime(state, 0.8, car.x, car.y); // grand theft auto
    state.toast = 'Stolen! The owner called it in.';
  } else if (wasTraffic) {
    commitCrime(state, 1.1, car.x, car.y); // carjacking
    state.toast = 'Carjacked! Solmar PD is rolling.';
    // The driver bails out and runs.
    state.peds.push({
      x: car.x + 20, y: car.y + 14, angle: 0, speed: 0, tx: car.x, ty: car.y,
      state: 'flee', color: '#c7ecee', skin: '#e0ac69', health: 100,
      downTimer: 0, fleeX: car.x, fleeY: car.y, fleeT: 3, fare: false, walkPhase: 0,
    });
  }
}

function melee(state) {
  const p = state.player;
  p.attackCd = 0.38;
  state.audio.punch();
  const hx = p.x + Math.cos(p.angle) * 24;
  const hy = p.y + Math.sin(p.angle) * 24;
  state.effects.push({ type: 'swing', x: hx, y: hy, vx: 0, vy: 0, life: 0.12, maxLife: 0.12, size: 12 });
  for (const ped of state.peds) {
    if (ped.state !== 'down' && dist(hx, hy, ped.x, ped.y) < 22) {
      ped.health -= 45;
      if (ped.health <= 0) { ped.state = 'down'; ped.downTimer = 9999; }
      else { ped.state = 'flee'; ped.fleeX = p.x; ped.fleeY = p.y; ped.fleeT = 3; }
      commitCrime(state, 0.6, p.x, p.y);
      return;
    }
  }
  for (const foot of state.footCops) {
    if (dist(hx, hy, foot.x, foot.y) < 22) {
      // Shove the officer back and break the arrest.
      foot.x += Math.cos(p.angle) * 30;
      foot.y += Math.sin(p.angle) * 30;
      foot.grabTimer = 0;
      commitCrime(state, 0.8, p.x, p.y);
      return;
    }
  }
  const car = nearestCar(state, p.x, p.y, 40);
  if (car) {
    car.health -= 4;
    commitCrime(state, 0.3, p.x, p.y);
  }
}

function shoot(state) {
  const p = state.player;
  p.attackCd = 0.24;
  state.audio.shot();
  const range = 400;
  const mx = p.x + Math.cos(p.angle) * 16;
  const my = p.y + Math.sin(p.angle) * 16;
  state.effects.push({ type: 'flash', x: mx, y: my, vx: 0, vy: 0, life: 0.06, maxLife: 0.06, size: 11 });
  commitCrime(state, 1.2, p.x, p.y);
  scarePeds(state, p.x, p.y, 260);
  // Hitscan: the closest living thing along the aim line takes the round.
  let bestT = range;
  let hitPed = null;
  let hitCar = null;
  let hitFoot = null;
  const dx = Math.cos(p.angle);
  const dy = Math.sin(p.angle);
  const test = (x, y, r) => {
    const t = (x - p.x) * dx + (y - p.y) * dy;
    if (t < 0 || t > bestT) return -1;
    const px = p.x + dx * t;
    const py = p.y + dy * t;
    return dist(px, py, x, y) < r ? t : -1;
  };
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    const t = test(ped.x, ped.y, 11);
    if (t >= 0) { bestT = t; hitPed = ped; hitCar = null; hitFoot = null; }
  }
  for (const foot of state.footCops) {
    const t = test(foot.x, foot.y, 11);
    if (t >= 0) { bestT = t; hitFoot = foot; hitPed = null; hitCar = null; }
  }
  for (const car of state.cars) {
    const t = test(car.x, car.y, 21);
    if (t >= 0) { bestT = t; hitCar = car; hitPed = null; hitFoot = null; }
  }
  const ex = p.x + dx * bestT;
  const ey = p.y + dy * bestT;
  state.effects.push({ type: 'spark', x: ex, y: ey, vx: 0, vy: 0, life: 0.18, maxLife: 0.18, size: 8 });
  if (hitPed) {
    hitPed.health -= 60;
    if (hitPed.health <= 0) { hitPed.state = 'down'; hitPed.downTimer = 9999; commitCrime(state, 0.8, p.x, p.y); }
    else { hitPed.state = 'flee'; hitPed.fleeX = p.x; hitPed.fleeY = p.y; hitPed.fleeT = 3; }
  } else if (hitFoot) {
    // Officers are armoured: a hit staggers them and breaks the arrest.
    hitFoot.x -= dx * 16;
    hitFoot.y -= dy * 16;
    hitFoot.grabTimer = 0;
    commitCrime(state, 1, p.x, p.y);
  } else if (hitCar) {
    hitCar.health -= 9;
    if (hitCar.kind === 'police') commitCrime(state, 0.7, p.x, p.y);
  }
}

export function clampHealth(state) {
  state.player.health = clamp(state.player.health, 0, 100);
}
