/**
 * Twilio can only play MP3, WAV and AIFF. Phone voice memos are usually
 * M4A/AAC (sometimes with a wrong file extension), so anything else is
 * decoded by the browser and re-encoded as 16 kHz mono 16-bit WAV — phone
 * calls are 8 kHz, so no audible quality is lost.
 */

const TARGET_SAMPLE_RATE = 16_000;

export type PreparedRecording = { blob: Blob; filename: string; converted: boolean; durationSeconds?: number };

function playableKind(header: Uint8Array): "mp3" | "wav" | "aiff" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...header.slice(from, to));
  if (ascii(0, 3) === "ID3" || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) return "mp3";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 4) === "FORM" && (ascii(8, 12) === "AIFF" || ascii(8, 12) === "AIFC")) return "aiff";
  return null;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function prepareRecording(file: File): Promise<PreparedRecording> {
  const data = await file.arrayBuffer();
  const kind = playableKind(new Uint8Array(data, 0, Math.min(12, data.byteLength)));
  const baseName = file.name.replace(/\.[^.]+$/, "") || "recording";
  if (kind) {
    return { blob: file, filename: `${baseName}.${kind}`, converted: false };
  }

  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser can't convert audio. Upload an MP3 or WAV file instead.");

  const context = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(data.slice(0));
  } catch {
    throw new Error("Couldn't read this audio file. Upload an MP3 or WAV file instead.");
  } finally {
    void context.close();
  }

  const length = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;  // multi-channel input is down-mixed to mono
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return {
    blob: encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE),
    filename: `${baseName}.wav`,
    converted: true,
    durationSeconds: decoded.duration
  };
}
