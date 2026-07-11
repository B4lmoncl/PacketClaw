/**
 * Synthetische UI-Sounds via Web Audio — selbst generiert, keine Samples.
 * Kein Autoplay: Der AudioContext entsteht erst bei der ersten Nutzer-Interaktion
 * (Browser-Policy), danach sind die Blips sofort verfügbar.
 */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function getCtx(): AudioContext | null {
  if (!enabled) return null;
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function blip(params: {
  freq: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}) {
  const audio = getCtx();
  if (!audio) return;
  const start = audio.currentTime + (params.delay ?? 0);
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = params.type ?? 'square';
  osc.frequency.setValueAtTime(params.freq, start);
  if (params.freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(params.freqEnd, start + params.duration);
  }
  const volume = params.gain ?? 0.04;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + params.duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + params.duration + 0.02);
}

/** Match-Tick beim Packet Descent (pro Zeile) */
export function playTick() {
  blip({ freq: 880, duration: 0.05, type: 'square', gain: 0.02 });
}

/** ACCEPT: kurzer aufsteigender Doppelton */
export function playAccept() {
  blip({ freq: 520, freqEnd: 780, duration: 0.12, type: 'triangle', gain: 0.05 });
  blip({ freq: 780, freqEnd: 1040, duration: 0.14, type: 'triangle', gain: 0.045, delay: 0.09 });
}

/** DENY: der Snip — kurzes, fallendes Knacken */
export function playSnip() {
  blip({ freq: 300, freqEnd: 90, duration: 0.16, type: 'sawtooth', gain: 0.055 });
  blip({ freq: 1400, freqEnd: 900, duration: 0.05, type: 'square', gain: 0.025 });
}

/** Falsche Antwort: dumpfer Boing */
export function playWrong() {
  blip({ freq: 200, freqEnd: 120, duration: 0.25, type: 'sine', gain: 0.05 });
}

/** Level geschafft / 3 Sterne: kleiner Chime */
export function playChime(stars: number) {
  const base = [523, 659, 784]; // C-E-G
  base.slice(0, Math.max(1, stars)).forEach((freq, i) => {
    blip({ freq, duration: 0.22, type: 'triangle', gain: 0.05, delay: i * 0.12 });
  });
  if (stars >= 3) {
    blip({ freq: 1047, duration: 0.3, type: 'triangle', gain: 0.05, delay: 0.36 });
  }
}

/** Achievement freigeschaltet */
export function playAchievement() {
  blip({ freq: 660, freqEnd: 990, duration: 0.18, type: 'triangle', gain: 0.05 });
  blip({ freq: 990, freqEnd: 1320, duration: 0.22, type: 'triangle', gain: 0.045, delay: 0.14 });
}
