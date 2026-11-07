// Short UI tones (Web Audio). Silent when audio is blocked before a user gesture.
let ctx = null;

export function playTone(freq = 880, ms = 120, volume = 0.15) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch { /* audio blocked */ }
}

export const beepOk = () => playTone(1175, 90);
export const beepError = () => playTone(220, 260, 0.2);
