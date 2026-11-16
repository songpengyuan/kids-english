/**
 * 录音 → 讯飞评测要求的音频格式。
 *
 * MediaRecorder 产出的是 webm(opus) 或 mp4(aac)，而讯飞 ISE 只吃
 * 16k / 16bit / 单声道 PCM。这里用浏览器自带的解码与离线渲染完成转换，
 * 不依赖服务器装 ffmpeg：
 *
 *   ObjectURL → arrayBuffer → decodeAudioData → OfflineAudioContext(16k)
 *   → Int16 PCM → 补 WAV 头
 *
 * 任何一步失败都返回 null，调用方据此降级（绝不把半成品发给后端，
 * 否则后端会把 webm 当成裸 PCM 送进讯飞，得到莫名其妙的低分）。
 */

const TARGET_RATE = 16000;

/** Float32（-1~1）→ Int16 PCM，超范围截断，避免爆音 */
function toInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = f32[i] < -1 ? -1 : f32[i] > 1 ? 1 : f32[i];
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** 拼 44 字节标准 RIFF/WAVE 头 + PCM 数据 */
function wrapWav(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const dataBytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 块长度
  view.setUint16(20, 1, true); // PCM 编码
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // 字节率
  view.setUint16(32, 2, true); // 块对齐
  view.setUint16(34, 16, true); // 位深
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(pcm);

  return buf;
}

/**
 * 把录音 ObjectURL 转成 16k 单声道 16bit WAV。
 * @returns 成功返回 Blob（audio/wav）；解码/重采样失败返回 null
 */
export async function recUrlToWav16k(url: string): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = await fetch(url).then((r) => r.arrayBuffer());
    if (!raw.byteLength) return null;

    const AudioCtx: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    // 解码：用一次性上下文，解完立刻关掉，不占音频设备
    const decodeCtx = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await decodeCtx.decodeAudioData(raw.slice(0));
    } finally {
      try {
        await decodeCtx.close();
      } catch {
        /* 某些实现 close 会抛，忽略 */
      }
    }
    if (!decoded || !decoded.duration) return null;

    const frames = Math.max(1, Math.round(decoded.duration * TARGET_RATE));
    const OfflineCtx: typeof OfflineAudioContext | undefined =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!OfflineCtx) return null;

    // 离线重采样：比手工抽稀多一层低通，避免 48k→16k 的混叠失真影响评测
    const offline = new OfflineCtx(1, frames, TARGET_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    const pcm = toInt16(rendered.getChannelData(0));
    if (!pcm.length) return null;

    return new Blob([wrapWav(pcm, TARGET_RATE)], { type: "audio/wav" });
  } catch {
    return null;
  }
}
