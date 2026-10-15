// Browser-only: pull the soundtrack out of a video, downsample to 16 kHz mono WAV,
// and split it into ~10-minute segments small enough to transcribe.
const RATE = 16000;
const SEGMENT_SECONDS = 600;

export function isVideo(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(file.name);
}

export async function videoToWavSegments(file: File): Promise<Blob[]> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Couldn't read the audio in this video. Try MP4 or WebM.");
  } finally {
    void ctx.close();
  }
  const length = Math.ceil(decoded.duration * RATE);
  if (!length) throw new Error("This video has no sound to summarize.");
  const off = new OfflineAudioContext(1, length, RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const out: Blob[] = [];
  const step = SEGMENT_SECONDS * RATE;
  for (let i = 0; i < mono.length; i += step) out.push(encodeWav(mono.subarray(i, i + step)));
  return out;
}

function encodeWav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
