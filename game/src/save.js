// save.js — SOLMAR progress in localStorage: money, story position, shells,
// player position and the clock, so a run can be picked up where it stopped.
const KEY = 'solmar-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      money: state.money,
      missionIndex: state.mission.index,
      shellsFound: [...state.shellsFound],
      player: { x: state.player.x, y: state.player.y },
      minutes: state.minutes,
      faresDone: state.faresDone,
      storyDone: state.storyDone,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
}

export function hasSave() {
  return loadSave() !== null;
}
