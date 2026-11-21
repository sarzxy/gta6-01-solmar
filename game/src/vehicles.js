// vehicles.js — every car in Solmar: parked cars waiting to be stolen, traffic
// driving the road grid, and the physics all of them share. Drivers (traffic
// AI, police AI, the player) only set controls; this module moves the metal.
import { AVENUES, STREETS, collideCircle, groundAt, parkingSpots } from './world.js';
import { CAR_COLORS } from './theme.js';
import { angleDelta, clamp, choice, dist, makeRng } from './util.js';

export const CAR_RADIUS = 18;
const LANE = 23;

let nextId = 1;

export function makeCar(x, y, angle, color, kind) {
  return {
    id: nextId++, x, y, angle, speed: 0, color, kind,
    health: 100, driver: null, controls: { throttle: 0, brake: 0, steer: 0 },
    leg: null, sirenPhase: Math.random() * 6, footCop: null, dead: false,
  };
}

export function createCars() {
  const rng = makeRng(777);
  const cars = [];
  for (const spot of parkingSpots) {
    if (rng() < 0.45) continue;
    cars.push(makeCar(spot.x, spot.y, spot.angle, choice(rng, CAR_COLORS), 'parked'));
  }
  // Traffic: one or two cars per avenue/street, mid-block, already rolling.
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      if (rng() < 0.45) continue;
      const car = makeCar(ax + LANE, sy - 130, -Math.PI / 2, choice(rng, CAR_COLORS), 'traffic');
      car.driver = 'traffic';
      car.leg = { axis: 'v', fixed: ax, to: sy - 350, dir: -1 };
      car.speed = 130;
      cars.push(car);
    }
  }
  return cars;
}

function laneOffset(axis, dir) {
  // Right-hand traffic: heading south or east keeps to the + side of screen
  // axes as seen by the driver; the offsets below are that rule in pixels.
  if (axis === 'v') return dir > 0 ? -LANE : LANE;
  return dir > 0 ? LANE : -LANE;
}

function nextCrossing(axis, fixed, pos, dir) {
  const lines = axis === 'v' ? STREETS : AVENUES;
  const beyond = lines.filter((c) => (dir > 0 ? c > pos + 30 : c < pos - 30));
  if (beyond.length === 0) return null;
  return dir > 0 ? Math.min(...beyond) : Math.max(...beyond);
}

function pickNextLeg(car, rng) {
  const leg = car.leg;
  const at = leg.axis === 'v' ? car.y : car.x;
  const straight = nextCrossing(leg.axis, leg.fixed, at, leg.dir);
  const turn = rng() < 0.4;
  if (turn) {
    const newAxis = leg.axis === 'v' ? 'h' : 'v';
    const newDir = rng() < 0.5 ? 1 : -1;
    const to = nextCrossing(newAxis, leg.to, newAxis === 'v' ? car.y : car.x, newDir);
    if (to !== null) {
      car.leg = { axis: newAxis, fixed: leg.to, to, dir: newDir };
      return;
    }
  }
  if (straight !== null) {
    car.leg = { axis: leg.axis, fixed: leg.fixed, to: straight, dir: leg.dir };
  } else {
    // End of the road: turn around onto the same line, other lane.
    const back = nextCrossing(leg.axis, leg.fixed, at, -leg.dir);
    car.leg = { axis: leg.axis, fixed: leg.fixed, to: back ?? at, dir: -leg.dir };
  }
}

// Traffic brains: follow the current leg's lane point, brake for obstacles.
export function updateTrafficAI(state, dt) {
  const rng = state.rng;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.driver !== 'traffic') continue;
    if (!car.leg) car.leg = { axis: 'v', fixed: AVENUES[0], to: car.y - 300, dir: -1 };
    const leg = car.leg;
    const tx = leg.axis === 'v' ? leg.fixed + laneOffset('v', leg.dir) : leg.to;
    const ty = leg.axis === 'v' ? leg.to : leg.fixed + laneOffset('h', leg.dir);
    const d = dist(car.x, car.y, tx, ty);
    if (d < 52) pickNextLeg(car, rng);
    const want = Math.atan2(ty - car.y, tx - car.x);
    const delta = angleDelta(car.angle, want);
    car.controls.steer = clamp(delta * 2.4, -1, 1);
    // Obstacle ahead?
    const ax = car.x + Math.cos(car.angle) * 52;
    const ay = car.y + Math.sin(car.angle) * 52;
    let blocked = false;
    for (const other of state.cars) {
      if (other !== car && dist(ax, ay, other.x, other.y) < 30) { blocked = true; break; }
    }
    if (!blocked) {
      for (const ped of state.peds) {
        if (ped.state !== 'down' && dist(ax, ay, ped.x, ped.y) < 26) { blocked = true; break; }
      }
    }
    if (!blocked && state.player.car !== car && dist(ax, ay, state.player.x, state.player.y) < 26) blocked = true;
    if (blocked) {
      car.controls.throttle = 0;
      car.controls.brake = car.speed > 20 ? 1 : 0;
    } else {
      car.controls.brake = 0;
      car.controls.throttle = car.speed < 165 ? 0.8 : 0.25;
    }
    // Keep the world populated near the player: recycle far-away traffic.
    if (dist(car.x, car.y, state.player.x, state.player.y) > 1500) {
      const spot = state.intersectionsNear[Math.floor(rng() * state.intersectionsNear.length)];
      if (spot) {
        car.x = spot.x + LANE;
        car.y = spot.y - 140;
        car.angle = -Math.PI / 2;
        car.leg = { axis: 'v', fixed: spot.x, to: spot.y - 350, dir: -1 };
        car.speed = 120;
      }
    }
  }
}

// Physics + collisions for every car, whatever drives it.
export function stepCars(state, dt) {
  for (const car of state.cars) {
    if (car.kind === 'parked' && Math.abs(car.speed) < 0.5) { car.speed = 0; continue; }
    const c = car.controls;
    const ground = groundAt(car.x, car.y);
    const offroad = ground === 'land' || ground === 'sand';
    const maxF = offroad ? 150 : 335;
    if (c.throttle > 0) car.speed += 250 * c.throttle * dt;
    if (c.throttle < 0) car.speed += (car.speed > 12 ? -430 : -150) * dt;
    if (c.brake > 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 480 * c.brake * dt);
    car.speed -= car.speed * (offroad ? 1.5 : 0.55) * dt;
    if (c.throttle === 0 && c.brake === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = clamp(car.speed, -120, maxF);
    const turn = c.steer * 2.1 * clamp(car.speed / 130, -1, 1);
    car.angle += turn * dt * (c.brake > 0 && Math.abs(car.speed) > 120 ? 1.5 : 1);
    const vx = Math.cos(car.angle) * car.speed;
    const vy = Math.sin(car.angle) * car.speed;
    car.x += vx * dt;
    car.y += vy * dt;
    const impact = Math.abs(car.speed);
    const [nx, ny, hit] = collideCircle(car.x, car.y, CAR_RADIUS);
    if (hit) {
      car.x = nx;
      car.y = ny;
      if (impact > 130) {
        car.health -= (impact - 120) * 0.06;
        state.events.push({ type: 'crash', x: car.x, y: car.y, amount: impact / 330, car });
      }
      car.speed *= 0.45;
    }
    // Skid marks and damage smoke for the renderer.
    if (Math.abs(car.speed) > 150 && Math.abs(c.steer) > 0.55 && state.skids.length < 500) {
      state.skids.push({ x: car.x - Math.cos(car.angle) * 12, y: car.y - Math.sin(car.angle) * 12, angle: car.angle, life: 7 });
    }
    if (car.health < 35 && Math.random() < dt * 6) {
      state.effects.push({ type: 'smoke', x: car.x, y: car.y - 8, vx: 0, vy: -22, life: 0.9, maxLife: 0.9, size: 7 });
    }
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      state.effects.push({ type: 'burst', x: car.x, y: car.y, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 26 });
    }
    c.throttle = 0;
    c.brake = 0;
    c.steer = 0;
  }
  // Car-to-car bumps.
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      if (d === 0 || d >= CAR_RADIUS * 2) continue;
      const push = (CAR_RADIUS * 2 - d) / 2;
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 90) {
        a.health -= rel * 0.03;
        b.health -= rel * 0.03;
        state.events.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, amount: rel / 300, car: a });
      }
      const swap = (a.speed + b.speed) / 2;
      a.speed = swap * 0.8;
      b.speed = swap * 0.8;
    }
  }
}
