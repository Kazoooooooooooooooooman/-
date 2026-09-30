// Turns a recorded Blob (webm/mp4 from MediaRecorder) into 16-bit mono WAV, and measures it.
export async function toWav(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const ch = audio.getChannelData(0), rate = audio.sampleRate, n = ch.length;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    if (Math.abs(s) >= 0.999) clipped++;
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  // Same measurement as the server (quality.py): loudness per 50 ms window, below -50 dBFS counts as silence.
  const win = Math.max(1, Math.floor(rate / 20)), levels = [];
  for (let i = 0; i < n; i += win) {
    let sq = 0; const end = Math.min(n, i + win);
    for (let j = i; j < end; j++) sq += ch[j] * ch[j];
    const rms = Math.sqrt(sq / (end - i));
    levels.push(rms > 0 ? 20 * Math.log10(rms) : -120);
  }
  const voiced = levels.filter((lv) => lv >= -50);
  const level = voiced.length ? voiced.reduce((a, b) => a + b, 0) / voiced.length : -120;
  const silenceRatio = levels.length ? 1 - voiced.length / levels.length : 1;
  return { wav: new Blob([buf], { type: "audio/wav" }), seconds: n / rate, level, clipRatio: clipped / n, silenceRatio };
}
