// main.js — SOLMAR's heartbeat: builds the world state, runs the loop, moves
// the camera, owns the clock, resolves busted and wasted, and wires the menu
// and pause screens to the game.
import { WORLD_H, WORLD_W, intersections, places } from './world.js';
import { clamp } from './util.js';
import { createInput, endFrame, keyPressed } from './input.js';
import { createAudio } from './audio.js';
import { clearSave, hasSave, loadSave, writeSave } from './save.js';
import { createPlayer, clampHealth, updatePlayer } from './player.js';
import { createCars, stepCars, updateTrafficAI } from './vehicles.js';
import { createPeds, updatePeds } from './peds.js';
import { createWanted, respawnPoint, updatePolice, commitCrime } from './police.js';
import { INTRO_LINES, MISSION_TITLES, startDialogue, startMission, updateDialogue, updateMissions } from './missions.js';
import { render } from './render.js';
import { drawHud } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();

let state = null;
let lastTime = 0;

function buildState(saved) {
  const s = {
    mode: 'menu',
    minutes: saved?.minutes ?? 10 * 60,
    day: 1,
    money: saved?.money ?? 25,
    timeSeconds: 0,
    rng: Math.random,
    input,
    audio,
    player: createPlayer(saved),
    cars: createCars(),
    peds: createPeds(),
    cops: [],
    footCops: [],
    wanted: createWanted(),
    mission: { index: 0, step: 0, timer: 0, data: {} },
    dialogue: null,
    objective: null,
    effects: [],
    skids: [],
    events: [],
    shellsFound: new Set(saved?.shellsFound ?? []),
    faresDone: saved?.faresDone ?? 0,
    storyDone: saved?.storyDone ?? false,
    fare: null,
    fareTimer: 10,
    bustedMeter: 0,
    pendingBusted: false,
    banner: null,
    toast: '',
    toastT: 0,
    endCard: null,
    endTimer: 0,
    camera: { x: 0, y: 0 },
    view: { w: window.innerWidth, h: window.innerHeight },
    intersectionsNear: [],
    nearTimer: 0,
    lastToast: '',
  };
  if (saved) {
    const idx = Math.min(saved.missionIndex ?? 0, MISSION_TITLES.length);
    if (idx < MISSION_TITLES.length) startMission(s, idx);
    else s.mission = { index: idx, step: 0, timer: 0, data: {} };
    if (idx >= 2) s.player.hasPistol = true;
  }
  return s;
}

function newGame() {
  clearSave();
  state = buildState(null);
  state.mode = 'play';
  startMission(state, 0);
  startDialogue(state, INTRO_LINES, null);
  hideOverlays();
  audio.unlock();
}

function continueGame() {
  const saved = loadSave();
  state = buildState(saved);
  state.mode = 'play';
  hideOverlays();
  audio.unlock();
  state.toast = 'Welcome back to Solmar.';
}

function hideOverlays() {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
}

function showMenu() {
  state.mode = 'menu';
  document.getElementById('continueBtn').style.display = hasSave() ? '' : 'none';
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('pause').classList.add('hidden');
}

function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'pause';
    writeSave(state);
    document.getElementById('pause').classList.remove('hidden');
  } else if (state.mode === 'pause') {
    state.mode = 'play';
    document.getElementById('pause').classList.add('hidden');
  }
}

function resolveBusted() {
  const fine = 100 + Math.ceil(state.wanted.level) * 75;
  state.money = Math.max(0, state.money - fine);
  state.endCard = { kind: 'busted', title: 'BUSTED', sub: 'Solmar PD lets you go — minus $' + fine + ' and your afternoon.' };
  state.endTimer = 2.4;
  state.pendingBusted = false;
  state.bustedMeter = 0;
}

function resolveWasted() {
  const cost = Math.floor(state.money * 0.12);
  state.money -= cost;
  state.endCard = { kind: 'wasted', title: 'WASTED', sub: 'Solmar General patches you up — $' + cost + ' for the trouble.' };
  state.endTimer = 2.4;
}

function respawn() {
  const spot = respawnPoint();
  const p = state.player;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
  }
  p.x = spot.x;
  p.y = spot.y;
  p.health = 100;
  p.speed = 0;
  state.wanted.level = 0;
  state.wanted.unseenTimer = 0;
  state.minutes += 180;
  // The fleet goes home; the foot cops clock off.
  for (const cop of state.cops) {
    const i = state.cars.indexOf(cop);
    if (i >= 0) state.cars.splice(i, 1);
  }
  state.cops = [];
  state.footCops = [];
  state.endCard = null;
  writeSave(state);
}

function processEvents() {
  for (const e of state.events) {
    const near = Math.hypot(e.x - state.player.x, e.y - state.player.y) < 320;
    if (e.type === 'crash') {
      if (near || e.car === state.player.car) audio.crash(e.amount);
      if (e.car === state.player.car && e.amount > 0.45) commitCrime(state, 0.3, e.x, e.y);
    } else if (e.type === 'pedHit') {
      if (e.car === state.player.car || e.car.driver === 'player') {
        commitCrime(state, e.fatal ? 1.7 : 0.9, e.x, e.y);
        state.toast = e.fatal ? 'You flattened a pedestrian!' : 'You hit a pedestrian!';
        audio.crash(0.7);
      }
    }
  }
  state.events.length = 0;
}

function update(dt) {
  state.timeSeconds += dt;
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }
  if (state.toast !== state.lastToast) {
    state.lastToast = state.toast;
    state.toastT = 3.4;
  }
  if (state.toastT > 0) state.toastT -= dt;

  if (state.endCard) {
    state.endTimer -= dt;
    if (state.endTimer <= 0) respawn();
    updateCamera(dt, true);
    return;
  }

  // The clock: a full day takes four minutes.
  state.minutes += dt * 6;
  if (state.minutes >= 1440) {
    state.minutes -= 1440;
    state.day++;
  }

  state.nearTimer -= dt;
  if (state.nearTimer <= 0) {
    state.nearTimer = 0.5;
    state.intersectionsNear = intersections.filter(
      (i) => Math.hypot(i.x - state.player.x, i.y - state.player.y) < 1050,
    );
  }

  if (state.dialogue) {
    updateDialogue(state);
    updateCamera(dt, false);
    return;
  }

  updatePlayer(state, dt);
  updateTrafficAI(state, dt);
  updatePolice(state, dt);
  stepCars(state, dt);
  processEvents();
  updatePeds(state, dt);
  updateMissions(state, dt);
  clampHealth(state);

  // Effects and skid marks age out.
  for (let i = state.effects.length - 1; i >= 0; i--) {
    const e = state.effects[i];
    e.life -= dt;
    e.x += (e.vx ?? 0) * dt;
    e.y += (e.vy ?? 0) * dt;
    if (e.life <= 0) state.effects.splice(i, 1);
  }
  for (let i = state.skids.length - 1; i >= 0; i--) {
    state.skids[i].life -= dt;
    if (state.skids[i].life <= 0) state.skids.splice(i, 1);
  }

  if (state.pendingBusted) resolveBusted();
  else if (state.player.health <= 0) resolveWasted();

  audio.updateEngine(
    state.player.car ? Math.abs(state.player.car.speed) / 335 : 0,
    Boolean(state.player.car),
  );
  const sirenNear = state.cops.some((c) => Math.hypot(c.x - state.player.x, c.y - state.player.y) < 760);
  audio.updateSiren(sirenNear, dt);
  updateCamera(dt, false);
}

function updateCamera(dt, slow) {
  const p = state.player;
  const { w, h } = state.view;
  let tx;
  let ty;
  if (state.mode === 'menu') {
    // A slow drift over the coast while the title is up.
    tx = 1500 + Math.sin(state.timeSeconds * 0.05) * 700;
    ty = 800 + Math.cos(state.timeSeconds * 0.037) * 420;
  } else {
    tx = p.x - w / 2;
    ty = p.y - h / 2;
  }
  const k = slow ? 1 : 1 - Math.pow(0.0015, dt);
  state.camera.x += (tx - state.camera.x) * (state.mode === 'menu' ? dt * 0.4 : k);
  state.camera.y += (ty - state.camera.y) * (state.mode === 'menu' ? dt * 0.4 : k);
  state.camera.x = clamp(state.camera.x, 0, Math.max(0, WORLD_W - w));
  state.camera.y = clamp(state.camera.y, 0, Math.max(0, WORLD_H - h));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 0.016);
  lastTime = now;
  if (!state) return;
  if (state.mode === 'play') update(dt);
  else {
    state.timeSeconds += dt;
    updateCamera(dt, true);
  }
  render(ctx, state);
  if (state.mode !== 'menu') drawHud(ctx, state);
  if (keyPressed(input, 'KeyP', 'Escape') && !state.dialogue && state.mode !== 'menu') togglePause();
  if (keyPressed(input, 'KeyM')) {
    const muted = audio.toggleMute();
    state.toast = muted ? 'Sound off' : 'Sound on';
  }
  endFrame(input);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (state) {
    state.view.w = canvas.width;
    state.view.h = canvas.height;
  }
}
window.addEventListener('resize', resize);

document.getElementById('newBtn').addEventListener('click', newGame);
document.getElementById('continueBtn').addEventListener('click', continueGame);
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('saveBtn').addEventListener('click', () => {
  writeSave(state);
  state.toast = 'Saved.';
  togglePause();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  if (state.mission.index < MISSION_TITLES.length) {
    state.wanted.level = 0;
    startMission(state, state.mission.index);
    state.toast = 'Mission restarted.';
  }
  togglePause();
});
document.getElementById('quitBtn').addEventListener('click', () => {
  writeSave(state);
  showMenu();
});

// Boot on the title screen, drifting over the city.
state = buildState(null);
state.camera.x = places.diner.x - 400;
state.camera.y = places.diner.y;
input.attach();
resize();
showMenu();
requestAnimationFrame(frame);

// A handle for scripted captures and debugging.
window.__solmar = { get state() { return state; }, newGame, continueGame };
