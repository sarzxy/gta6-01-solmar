// smoke-test.mjs — headless exercise of the whole SOLMAR simulation: builds a
// state the way main.js does, then plays a scripted session (walk, steal a
// car, drive, raise a wanted level, talk through the first mission) and calls
// the renderer and HUD against a stub 2D context, day and night.
import { intersections, places } from '../game/src/world.js';
import { createPlayer, updatePlayer } from '../game/src/player.js';
import { createCars, stepCars, updateTrafficAI } from '../game/src/vehicles.js';
import { createPeds, updatePeds } from '../game/src/peds.js';
import { createWanted, updatePolice } from '../game/src/police.js';
import { startDialogue, startMission, updateDialogue, updateMissions } from '../game/src/missions.js';
import { render } from '../game/src/render.js';
import { drawHud } from '../game/src/hud.js';

const noop = () => {};
const audioStub = {
  blip: noop, pickup: noop, cash: noop, door: noop, crash: noop, shot: noop,
  punch: noop, missionDone: noop, busted: noop, unlock: noop,
  updateEngine: noop, updateSiren: noop, toggleMute: () => false, muted: false,
};
const input = {
  keys: new Set(), pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, clicked: false },
};

const state = {
  mode: 'play', minutes: 10 * 60, day: 1, money: 25, timeSeconds: 0,
  rng: Math.random, input, audio: audioStub,
  player: createPlayer(null), cars: createCars(), peds: createPeds(),
  cops: [], footCops: [], wanted: createWanted(),
  mission: { index: 0, step: 0, timer: 0, data: {} },
  dialogue: null, objective: null, effects: [], skids: [], events: [],
  shellsFound: new Set(), faresDone: 0, storyDone: false,
  fare: null, fareTimer: 10, bustedMeter: 0, pendingBusted: false,
  banner: null, toast: '', toastT: 0, endCard: null, endTimer: 0,
  camera: { x: 0, y: 0 }, view: { w: 1280, h: 720 },
  intersectionsNear: intersections.slice(0, 12), nearTimer: 0, lastToast: '',
};

const dt = 1 / 60;
function tick(n) {
  for (let i = 0; i < n; i++) {
    state.timeSeconds += dt;
    if (state.dialogue) {
      updateDialogue(state);
    } else {
      updatePlayer(state, dt);
      updateTrafficAI(state, dt);
      updatePolice(state, dt);
      stepCars(state, dt);
      state.events.length = 0;
      updatePeds(state, dt);
      updateMissions(state, dt);
    }
    input.pressed.clear();
    input.mouse.clicked = false;
    state.camera.x = Math.max(0, state.player.x - 640);
    state.camera.y = Math.max(0, state.player.y - 360);
  }
}
function press(code) {
  input.pressed.add(code);
  input.keys.add(code);
}
function hold(code, on) {
  if (on) input.keys.add(code);
  else input.keys.delete(code);
}

startMission(state, 0);
tick(30);

// Walk east for two seconds (the flat's own building is due north of the door).
hold('KeyD', true);
tick(120);
hold('KeyD', false);
console.log('walked to', Math.round(state.player.x), Math.round(state.player.y));

// Teleport to the diner and talk to Rosa: mission 0 completes, mission 1 starts.
state.player.x = places.diner.x;
state.player.y = places.diner.y + 10;
tick(2);
if (!state.dialogue) throw new Error('diner dialogue did not start');
while (state.dialogue) {
  press('KeyE');
  tick(1);
  input.keys.delete('KeyE');
}
console.log('after Rosa: mission index', state.mission.index, 'money', state.money);
if (state.mission.index !== 1) throw new Error('mission 1 did not start');

// Steal the marked car.
const target = state.mission.data.car;
state.player.x = target.x + 24;
state.player.y = target.y;
press('KeyE');
tick(1);
input.keys.delete('KeyE');
if (state.player.car !== target) throw new Error('could not enter the marked car');
console.log('stole the car; wanted level', state.wanted.level.toFixed(2));

// Drive west for three seconds.
hold('KeyW', true);
hold('KeyA', true);
tick(180);
hold('KeyW', false);
hold('KeyA', false);
console.log('drove to', Math.round(target.x), Math.round(target.y), 'speed', Math.round(target.speed));

// Deliver it: park at the chop shop, step out, Dex talks.
state.player.x = places.chopShop.x;
state.player.y = places.chopShop.y;
target.x = places.chopShop.x + 30;
target.y = places.chopShop.y;
target.speed = 0;
press('KeyE');
tick(1);
input.keys.delete('KeyE');
tick(2);
if (!state.dialogue) throw new Error('Dex dialogue did not start');
while (state.dialogue) {
  press('KeyE');
  tick(1);
  input.keys.delete('KeyE');
}
console.log('after Dex: mission', state.mission.index, 'pistol', state.player.hasPistol, 'money', state.money);
if (!state.player.hasPistol) throw new Error('pistol was not granted');

// Raise a three-star wanted level and let the PD work for ten seconds.
state.wanted.level = 3;
tick(600);
console.log('police out:', state.cops.length, 'cars total:', state.cars.length, 'player health', Math.round(state.player.health));
if (state.cops.length === 0) throw new Error('police never showed up');

// Let the heat die and run five quiet minutes of city life.
state.wanted.level = 0;
tick(600 * 5);
console.log('city life ok; peds down:', state.peds.filter((p) => p.state === 'down').length, 'of', state.peds.length);

// Render day and night against a stub context.
function stubCtx() {
  const grad = { addColorStop: noop };
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'measureText') return () => ({ width: 60 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (typeof prop === 'string') return noop;
      return undefined;
    },
    set() { return true; },
  });
}
state.minutes = 12 * 60;
render(stubCtx(), state);
drawHud(stubCtx(), state);
state.minutes = 23 * 60 + 30;
state.dialogue = { lines: [{ who: 'Rosa', text: 'A long line of dialogue that should wrap across the box without trouble at all.' }], i: 0, onDone: null };
render(stubCtx(), state);
drawHud(stubCtx(), state);
console.log('render + hud ok (day, night, dialogue)');
console.log('SMOKE TEST PASSED');
