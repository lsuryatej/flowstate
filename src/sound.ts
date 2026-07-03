// sound.ts — ONE short completion cue (SPEC_v0.md §6). WebAudio, no asset.
// Autoplay policy: the context unlocks on the first user gesture; call
// unlockAudio() from any click/keydown handler. Handled silently (law 11).

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Two soft sine notes, ~350ms total. Quiet by design (law 10). */
export function playCompletionChime(): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (const [freq, start, dur] of [
    [659.25, 0, 0.18], // E5
    [987.77, 0.12, 0.22], // B5
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.07, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
  }
}
