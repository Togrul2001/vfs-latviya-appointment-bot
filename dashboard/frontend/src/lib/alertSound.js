let sharedCtx = null;

function getContext() {
  if (!sharedCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

// İstifadəçi Ayarlar-da səsi açanda, həmin klik (user gesture) daxilində çağırılır ki,
// brauzerin avtomatik səs siyasəti (autoplay policy) bota mane olmasın.
export function unlockAudio() {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    // brauzer dəstəkləmirsə səssiz keç
  }
}

export function playAlertSound() {
  try {
    const ctx = getContext();
    const beep = (t, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    };
    const now = ctx.currentTime;
    beep(now, 880);
    beep(now + 0.4, 880);
    beep(now + 0.8, 1046);
  } catch {
    // brauzer səsi dəstəkləmirsə səssiz keç
  }
}
