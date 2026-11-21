// audio.js — every sound in SOLMAR is synthesised with WebAudio: engine hum,
// two-tone sirens, gunshots, pickups and a slow tropical pad loop. No audio
// files, nothing fetched. Created lazily on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;
  let musicTimer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    startMusic();
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(dur, vol, freq) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  // A slow Am–F–C–G pad with a soft marimba-ish pluck melody, looped.
  function startMusic() {
    const chords = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [130.81, 164.81, 196.0],
      [196.0, 246.94, 293.66],
    ];
    let step = 0;
    const playStep = () => {
      if (!ctx) return;
      const chord = chords[step % chords.length];
      for (const f of chord) tone(f, 3.6, 'triangle', 0.05);
      const melody = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33];
      tone(melody[step % melody.length], 0.5, 'sine', 0.06);
      step++;
    };
    playStep();
    musicTimer = setInterval(playStep, 1900);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.5, ctx.currentTime);
      return muted;
    },
    get muted() {
      return muted;
    },
    blip() {
      tone(880, 0.09, 'square', 0.12, 1320);
    },
    pickup() {
      tone(660, 0.1, 'sine', 0.16);
      setTimeout(() => tone(990, 0.16, 'sine', 0.16), 70);
    },
    cash() {
      tone(1244, 0.08, 'square', 0.1);
      setTimeout(() => tone(1864, 0.14, 'square', 0.1), 60);
    },
    door() {
      noise(0.15, 0.2, 900);
    },
    crash(intensity) {
      noise(0.25, Math.min(0.5, 0.15 + intensity * 0.4), 500);
    },
    shot() {
      noise(0.12, 0.4, 2400);
      tone(160, 0.1, 'sawtooth', 0.2, 60);
    },
    punch() {
      noise(0.08, 0.25, 700);
    },
    missionDone() {
      if (!ensure()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.16), i * 110));
    },
    busted() {
      tone(392, 0.3, 'square', 0.14);
      setTimeout(() => tone(311, 0.45, 'square', 0.14), 180);
    },
    // Continuous engine + siren, driven every frame with live values.
    updateEngine(speedRatio, inCar) {
      if (!ctx) return;
      if (inCar) {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineGain.gain.value = 0.0;
          engineOsc.connect(filter).connect(engineGain).connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.06, ctx.currentTime, 0.1);
      } else if (engineOsc) {
        engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
    },
    updateSiren(active, dt) {
      if (!ctx) return;
      if (active) {
        if (!sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'triangle';
          sirenGain.gain.value = 0.045;
          sirenOsc.connect(sirenGain).connect(master);
          sirenOsc.start();
        }
        sirenTimer += dt;
        sirenOsc.frequency.value = sirenTimer % 0.9 < 0.45 ? 720 : 960;
      } else if (sirenOsc) {
        sirenOsc.stop();
        sirenOsc.disconnect();
        sirenOsc = null;
        sirenGain = null;
      }
    },
    stopAll() {
      if (musicTimer) clearInterval(musicTimer);
    },
  };
}
