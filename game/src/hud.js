// hud.js — everything pinned to the screen: money and clock, wanted stars,
// health, the mission banner and toasts, the dialogue box, and the minimap
// with the player, the police and the objective on it.
import { WORLD_H, WORLD_W, AVENUES, STREETS, BEACH_X, WATER_X, buildings } from './world.js';
import { COLORS } from './theme.js';
import { clamp, dist, formatClock, formatMoney } from './util.js';
import { starsOf } from './police.js';
import { MISSION_TITLES } from './missions.js';

export function drawHud(ctx, state) {
  const { w, h } = state.view;
  drawTopLeft(ctx, state);
  drawWanted(ctx, state, w);
  drawBanner(ctx, state, w);
  drawMinimap(ctx, state, w, h);
  drawControlsHint(ctx, state, h);
  if (state.dialogue) drawDialogue(ctx, state, w, h);
  if (state.endCard) drawEndCard(ctx, state, w, h);
  if (state.player.health < 32 && !state.player.car) {
    const pulse = 0.16 + Math.sin(state.timeSeconds * 6) * 0.06;
    ctx.fillStyle = `rgba(200,20,20,${pulse.toFixed(3)})`;
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillRect(0, 0, 10, h);
    ctx.fillRect(w - 10, 0, 10, h);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.hudPanel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

function drawTopLeft(ctx, state) {
  panel(ctx, 14, 14, 208, 86);
  ctx.fillStyle = COLORS.hudAccent;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR', 26, 38);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(formatMoney(state.money), 96, 38);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(formatClock(state.minutes) + '  ·  Day ' + state.day, 26, 60);
  ctx.fillText('Shells ' + state.shellsFound.size + '/20   Fares ' + state.faresDone, 26, 80);
  // Health: Marlo's on foot, the car's while driving.
  const p = state.player;
  const value = p.car ? p.car.health : p.health;
  const label = p.car ? 'CAR' : 'HEALTH';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(label, 26, 96 - 0); // sits on the panel's lower edge line
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(86, 86, 124, 7);
  ctx.fillStyle = value > 35 ? '#58e08a' : COLORS.hudDanger;
  ctx.fillRect(86, 86, 124 * clamp(value, 0, 100) / 100, 7);
}

function drawWanted(ctx, state, w) {
  const stars = starsOf(state.wanted);
  if (stars === 0 && state.bustedMeter <= 0) return;
  panel(ctx, w - 196, 14, 182, 52);
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? COLORS.star : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', w - 182 + i * 26, 46);
  }
  ctx.fillStyle = COLORS.hudDanger;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('WANTED', w - 44, 45);
  if (state.bustedMeter > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(w - 182, 56, 154, 6);
    ctx.fillStyle = COLORS.hudDanger;
    ctx.fillRect(w - 182, 56, 154 * state.bustedMeter, 6);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('BUSTED?', w - 182, 52);
  }
}

function drawBanner(ctx, state, w) {
  let y = 16;
  if (state.banner && state.banner.t > 0) {
    const b = state.banner;
    ctx.fillStyle = 'rgba(8,10,16,0.78)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 230, y, 460, 58, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hudAccent;
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(b.title, w / 2, y + 25);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(b.sub, w / 2, y + 47);
    y += 68;
  }
  if (state.objective && !state.dialogue) {
    const o = state.objective;
    const d = Math.round(dist(state.player.x, state.player.y, o.x, o.y) / 10);
    const text = o.text + '   ·   ' + d + 'm';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 34;
    ctx.fillStyle = 'rgba(8,10,16,0.66)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - tw / 2, y, tw, 30, 15);
    ctx.fill();
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(w / 2 - tw / 2 + 16, y + 15, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2 + 8, y + 20);
  }
  if (state.toast && state.toastT > 0) {
    ctx.font = '14px system-ui, sans-serif';
    const tw = ctx.measureText(state.toast).width + 30;
    ctx.fillStyle = 'rgba(8,10,16,0.66)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - tw / 2, y + 40, tw, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(state.toast, w / 2, y + 58);
  }
  // Current mission name, quiet, under the banner stack.
  const mi = state.mission.index;
  if (mi < MISSION_TITLES.length && !state.dialogue) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STORY ' + (mi + 1) + '/' + MISSION_TITLES.length + ' — ' + MISSION_TITLES[mi].toUpperCase(), w / 2, 108);
  }
}

function drawMinimap(ctx, state, w, h) {
  const mw = 204;
  const mh = Math.round(mw * WORLD_H / WORLD_W);
  const x0 = w - mw - 14;
  const y0 = h - mh - 14;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, mw, mh, 8);
  ctx.clip();
  ctx.fillStyle = '#3f7a34';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.fillStyle = COLORS.sand ?? '#eed49b';
  ctx.fillRect(x0 + BEACH_X * sx, y0, (WATER_X - BEACH_X) * sx, mh);
  ctx.fillStyle = '#177e9c';
  ctx.fillRect(x0 + WATER_X * sx, y0, (WORLD_W - WATER_X) * sx, mh);
  ctx.strokeStyle = 'rgba(240,240,240,0.65)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const ax of AVENUES) {
    ctx.moveTo(x0 + ax * sx, y0);
    ctx.lineTo(x0 + ax * sx, y0 + mh);
  }
  for (const syLine of STREETS) {
    ctx.moveTo(x0, y0 + syLine * sy);
    ctx.lineTo(x0 + mw, y0 + syLine * sy);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(30,34,40,0.5)';
  for (const b of buildings) {
    ctx.fillRect(x0 + b.x * sx, y0 + b.y * sy, Math.max(1.6, b.w * sx), Math.max(1.6, b.h * sy));
  }
  // Police blips flash red/blue.
  const flash = Math.sin(state.timeSeconds * 7) > 0;
  for (const cop of state.cops) {
    ctx.fillStyle = flash ? '#ff5040' : '#3f8cff';
    ctx.beginPath();
    ctx.arc(x0 + cop.x * sx, y0 + cop.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const foot of state.footCops) {
    ctx.fillStyle = '#3f8cff';
    ctx.beginPath();
    ctx.arc(x0 + foot.x * sx, y0 + foot.y * sy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.objective) {
    const o = state.objective;
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(x0 + o.x * sx, y0 + o.y * sy, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,63,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x0 + o.x * sx, y0 + o.y * sy, 7 + Math.sin(state.timeSeconds * 4) * 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Player arrow.
  const p = state.player;
  ctx.translate(x0 + p.x * sx, y0 + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6.5, 0);
  ctx.lineTo(-4.5, -4);
  ctx.lineTo(-4.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x0, y0, mw, mh, 8);
  ctx.stroke();
}

function drawControlsHint(ctx, state, h) {
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const line = state.player.car
    ? 'W A S D drive · SPACE handbrake · E exit · P pause · M mute'
    : 'W A S D walk · SHIFT run · E enter car / talk · F fight' + (state.player.hasPistol ? ' · mouse aim + click shoot' : '') + ' · P pause · M mute';
  ctx.fillText(line, 16, h - 14);
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : line + ' ' + word;
    if (ctx.measureText(next).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function drawDialogue(ctx, state, w, h) {
  const d = state.dialogue;
  const line = d.lines[d.i];
  const boxW = Math.min(760, w - 60);
  const boxH = 108;
  const x = (w - boxW) / 2;
  const y = h - boxH - 46;
  ctx.fillStyle = COLORS.dialoguePanel;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,63,0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 12);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.hudAccent;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(line.who.toUpperCase(), x + 20, y + 27);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = '16px system-ui, sans-serif';
  const lines = wrapText(ctx, line.text, boxW - 40);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, x + 20, y + 53 + i * 21));
  if (Math.sin(state.timeSeconds * 5) > -0.2) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('E ▸', x + boxW - 16, y + boxH - 12);
  }
}

function drawEndCard(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(5,6,10,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = state.endCard.kind === 'busted' ? '#7fb2ff' : COLORS.hudDanger;
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText(state.endCard.title, w / 2, h / 2 - 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText(state.endCard.sub, w / 2, h / 2 + 22);
}
