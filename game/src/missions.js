// missions.js — Marlo's story in five jobs, plus the life around them: taxi
// fares for strangers and shells on the beach. Also runs the dialogue system
// every conversation in the game uses.
import { places, shellSpots } from './world.js';
import { dist } from './util.js';
import { keyPressed } from './input.js';
import { makeCar } from './vehicles.js';
import { writeSave } from './save.js';

export const MISSION_TITLES = ['Homecoming', 'First Wheels', 'Night Run', 'Heat Wave', 'Solmar Send-off'];
const REWARDS = [50, 150, 300, 400, 750];

export const INTRO_LINES = [
  { who: 'Rosa (phone)', text: 'Marlo? You made it back to Solmar. Good. Your room above the old place is still yours.' },
  { who: 'Marlo', text: 'Six years, Tia. The city looks smaller than I remember.' },
  { who: 'Rosa (phone)', text: 'It grew teeth while you were gone. Come see me at the diner — and walk. Stealing a car is how we met the police last time.' },
];
const ROSA_LINES = [
  { who: 'Rosa', text: 'Look at you. Too thin. Sit — no, no time. I need a favour before the lunch rush.' },
  { who: 'Rosa', text: 'Dex at the chop shop owes me a car, a pretty thing he was meant to deliver on Tuesday.' },
  { who: 'Marlo', text: 'You want me to collect a debt on my first day back?' },
  { who: 'Rosa', text: 'I want you to collect a car. How is your business. The marked one, near my door. Go.' },
];
const DEX_LINES = [
  { who: 'Dex', text: "Whoa — that is Rosa's car. You the nephew?" },
  { who: 'Marlo', text: 'Marlo. She says you owe her.' },
  { who: 'Dex', text: "Paid in full, then. One more thing — I left Rosa's pistol in the glovebox. Solmar is not the town you left, kid." },
  { who: 'Marlo', text: 'Hold the mouse to aim, click to fire. F if I want it quiet. Thanks, Dex.' },
];
const FOREMAN_LINES = [
  { who: 'Foreman', text: "Rosa's cargo, right on time. Tell her the port remembers its friends." },
  { who: 'Marlo', text: 'Tell her yourself. I am done being the net for one night.' },
];
const ROSA_END_LINES = [
  { who: 'Rosa (phone)', text: 'Marlo, that gold coupe is dirty money — the whole PD is looking for it.' },
  { who: 'Marlo', text: 'Then I will park it where they never look. The beach, at dawn.' },
  { who: 'Rosa (phone)', text: 'You always did land on your feet. Come home when the stars cool down. Dinner is on the house — forever.' },
];

export function startDialogue(state, lines, onDone) {
  state.dialogue = { lines, i: 0, onDone };
}

export function updateDialogue(state) {
  const d = state.dialogue;
  if (!d) return;
  if (keyPressed(state.input, 'KeyE', 'Enter', 'Space') || state.input.mouse.clicked) {
    state.audio.blip();
    d.i++;
    if (d.i >= d.lines.length) {
      state.dialogue = null;
      if (d.onDone) d.onDone(state);
    }
  }
}

export function startMission(state, index) {
  state.mission = { index, step: 0, timer: 0, data: {} };
  const m = state.mission;
  if (index === 1) {
    // The debt car: the parked car nearest the diner, marked for Marlo.
    let best = null;
    let bestD = 620;
    for (const car of state.cars) {
      if (car.kind !== 'parked') continue;
      const d = dist(car.x, car.y, places.diner.x, places.diner.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) {
      best = makeCar(places.diner.x + 130, places.diner.y + 90, 0, '#3498db', 'parked');
      state.cars.push(best);
    }
    m.data.car = best;
  }
  if (index === 2) {
    state.minutes = 21 * 60 + 5; // the run happens at night
  }
  if (index === 3) {
    m.data.checkpoints = [
      { x: 1500, y: 300 }, { x: 2300, y: 650 }, { x: 2700, y: 1350 },
      { x: 1900, y: 1700 }, { x: 1100, y: 1350 }, { x: 3120, y: 1000 },
    ];
    m.data.cp = 0;
    m.timer = 110;
  }
  if (index === 4) {
    const gold = makeCar(places.airport.x + 110, places.airport.y + 40, 0, '#f1c40f', 'parked');
    state.cars.push(gold);
    m.data.car = gold;
  }
  if (index < MISSION_TITLES.length) {
    state.banner = { title: 'MISSION ' + (index + 1), sub: MISSION_TITLES[index], t: 3 };
  }
}

function completeMission(state) {
  const index = state.mission.index;
  state.money += REWARDS[index];
  state.audio.missionDone();
  state.banner = { title: 'MISSION COMPLETE', sub: MISSION_TITLES[index] + '  +$' + REWARDS[index], t: 3.4 };
  const next = index + 1;
  if (next < MISSION_TITLES.length) {
    startMission(state, next);
  } else {
    state.mission = { index: next, step: 0, timer: 0, data: {} };
    state.storyDone = true;
    state.banner = { title: 'STORY COMPLETE', sub: 'Solmar is yours, Marlo. Fares and shells remain.', t: 4.5 };
  }
  writeSave(state);
}

function gotoObjective(state, spot, text) {
  state.objective = { x: spot.x, y: spot.y, text };
  return dist(state.player.x, state.player.y, spot.x, spot.y);
}

export function updateMissions(state, dt) {
  state.objective = null;
  const m = state.mission;
  if (state.dialogue) return; // conversations pause the world's errands
  switch (m.index) {
    case 0: {
      if (m.step === 0) {
        if (gotoObjective(state, places.diner, "Go to Rosa's Diner") < 95) {
          m.step = 1;
          startDialogue(state, ROSA_LINES, (s) => completeMission(s));
        }
      } else {
        state.objective = { x: places.diner.x, y: places.diner.y, text: 'Talk to Rosa' };
      }
      break;
    }
    case 1: {
      const car = m.data.car;
      if (m.step === 0) {
        state.objective = { x: car.x, y: car.y, text: 'Steal the marked car' };
        if (state.player.car === car) m.step = 1;
      } else if (m.step === 1) {
        if (gotoObjective(state, places.chopShop, "Deliver the car to Dex's Chop Shop") < 120 && !state.player.car) {
          m.step = 2;
          startDialogue(state, DEX_LINES, (s) => {
            s.player.hasPistol = true;
            completeMission(s);
          });
        } else if (state.player.car) {
          state.objective = { x: places.chopShop.x, y: places.chopShop.y, text: "Deliver the car to Dex's Chop Shop" };
        } else {
          state.objective = { x: car.x, y: car.y, text: 'Get back in the car' };
        }
      }
      break;
    }
    case 2: {
      if (m.step === 0) {
        if (gotoObjective(state, places.marina, 'Pick up the cargo at Solmar Marina') < 90) {
          m.step = 1;
          state.wanted.level = Math.max(state.wanted.level, 2);
          state.toast = 'Cargo loaded. Every cop in Solmar just woke up.';
          state.audio.blip();
        }
      } else if (m.step === 1) {
        if (gotoObjective(state, places.warehouse, 'Deliver the cargo to Port Warehouse 9') < 115) {
          m.step = 2;
          startDialogue(state, FOREMAN_LINES, (s) => completeMission(s));
        }
      } else {
        state.objective = { x: places.warehouse.x, y: places.warehouse.y, text: 'Talk to the foreman' };
      }
      break;
    }
    case 3: {
      const cps = m.data.checkpoints;
      const cp = cps[m.data.cp];
      m.timer -= dt;
      if (m.timer <= 0) {
        m.data.cp = 0;
        m.timer = 110;
        state.toast = 'Out of time — the route resets. Drive it again.';
        state.audio.busted();
      }
      state.objective = {
        x: cp.x, y: cp.y,
        text: 'Checkpoint ' + (m.data.cp + 1) + '/' + cps.length + ' — ' + Math.max(0, Math.ceil(m.timer)) + 's',
      };
      if (dist(state.player.x, state.player.y, cp.x, cp.y) < 68) {
        state.audio.pickup();
        m.data.cp++;
        m.timer += 12;
        if (m.data.cp >= cps.length) completeMission(state);
      }
      break;
    }
    case 4: {
      const car = m.data.car;
      if (m.step === 0) {
        state.objective = { x: car.x, y: car.y, text: 'Take the gold coupe at Solmar Airfield' };
        if (state.player.car === car) {
          m.step = 1;
          state.wanted.level = Math.max(state.wanted.level, 3);
          state.toast = 'That coupe is HOT. Lose yourself at the beach.';
        }
      } else {
        const hideout = { x: 3380, y: 620 };
        if (gotoObjective(state, hideout, 'Reach the beach hideout') < 105) {
          startDialogue(state, ROSA_END_LINES, (s) => completeMission(s));
          m.step = 2;
        }
      }
      break;
    }
    default: {
      state.objective = null; // free roam
    }
  }
  updateActivities(state, dt);
}

// Fares and shells: the small economies of a free afternoon in Solmar.
function updateActivities(state, dt) {
  const p = state.player;
  // Shells are picked up on foot at the beach.
  if (!p.car) {
    for (let i = 0; i < shellSpots.length; i++) {
      if (state.shellsFound.has(i)) continue;
      const s = shellSpots[i];
      if (dist(p.x, p.y, s.x, s.y) < 26) {
        state.shellsFound.add(i);
        state.money += 10;
        state.audio.pickup();
        state.toast = 'Shell found (' + state.shellsFound.size + '/20)  +$10';
      }
    }
  }
  // Fares: a waiting pedestrian hails any driver who stops beside them.
  state.fareTimer -= dt;
  if (!state.fare && state.fareTimer <= 0) {
    let waiting = null;
    for (const ped of state.peds) if (ped.fare) { waiting = ped; break; }
    if (!waiting) {
      const candidates = state.peds.filter(
        (ped) => ped.state === 'walk' && dist(ped.x, ped.y, p.x, p.y) < 760 && dist(ped.x, ped.y, p.x, p.y) > 200,
      );
      if (candidates.length > 0) {
        waiting = candidates[Math.floor(state.rng() * candidates.length)];
        waiting.fare = true;
      }
      state.fareTimer = 6;
    } else if (p.car && Math.abs(p.car.speed) < 16 && dist(p.x, p.y, waiting.x, waiting.y) < 46) {
      // Boarded: pick a destination across town and name the price.
      const dests = [places.diner, places.marina, places.hospital, places.airport, places.warehouse, places.chopShop, places.home];
      const dest = dests[Math.floor(state.rng() * dests.length)];
      const pay = Math.round(24 + dist(waiting.x, waiting.y, dest.x, dest.y) / 22);
      state.fare = { dest, pay };
      state.peds.splice(state.peds.indexOf(waiting), 1);
      state.audio.blip();
      state.toast = 'Fare aboard: ' + dest.name + ' — $' + pay;
    }
  }
  if (state.fare) {
    const f = state.fare;
    if (!state.objective) state.objective = { x: f.dest.x, y: f.dest.y, text: 'Fare: ' + f.dest.name + ' ($' + f.pay + ')' };
    if (p.car && Math.abs(p.car.speed) < 18 && dist(p.x, p.y, f.dest.x, f.dest.y) < 80) {
      state.money += f.pay;
      state.faresDone++;
      state.audio.cash();
      state.toast = 'Fare paid: +$' + f.pay;
      state.fare = null;
      state.fareTimer = 16;
      writeSave(state);
    }
  }
}
