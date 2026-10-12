// @vitest-environment jsdom
/**
 * speech 语音工具的回归测试（2026-09-27 修复的两件事）：
 * 1. TTS 按语言选音色：此前 pickVoice 写死英文音色，中文朗读怪音/无声；
 * 2. speakZh 的静音语义：提示语受音效开关约束，学习内容（bypassMute）始终可读。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** 必须在 import speech 之前注入浏览器 TTS stub（vi.hoisted 会提升到 import 之前） */
vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: Record<string, unknown>;
  };
  if (!w.window) return;
  const voices = [
    { lang: "en-US", name: "Google US English" },
    { lang: "zh-CN", name: "Microsoft Yaoyao - Chinese (Mainland)" },
  ];
  const captured: { u: any; at: number }[] = [];
  (w.window as any).__ttsCaptured = captured;
  (w.window as any).speechSynthesis = {
    getVoices: () => voices,
    cancel: vi.fn(),
    speak: (u: any) => {
      captured.push({ u, at: captured.length });
      // 模拟浏览器异步播完（5ms 后触发 onend）
      setTimeout(() => {
        try {
          u.onend?.();
        } catch {
          /* 忽略 */
        }
      }, 5);
    },
    onvoiceschanged: null,
  };
  (w.window as any).SpeechSynthesisUtterance = class {
    text: string;
    lang = "";
    voice: { lang: string; name: string } | null = null;
    rate = 1;
    pitch = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  };
});

import { speak, speakZh, stopSpeaking } from "../speech";
import { setSoundOn } from "../sound";

const cap = () => (globalThis as any).__ttsCaptured as { u: any; at: number }[];

describe("speech: TTS 语言选择", () => {
  beforeEach(() => {
    cap().length = 0;
    setSoundOn(true);
  });
  afterEach(() => setSoundOn(true));

  it("英文朗读（ttsOnly）选择英文音色", async () => {
    await speak("Ultraman Tiga", { ttsOnly: true });
    expect(cap().length).toBe(1);
    expect(cap()[0].u.lang).toBe("en-US");
    expect((cap()[0].u.voice as { lang: string }).lang.startsWith("en")).toBe(true);
  });

  it("中文朗读选择中文音色（回归：写死英文音色导致怪音/无声）", async () => {
    await speakZh("迪迦，复合型");
    expect(cap().length).toBe(1);
    expect(cap()[0].u.lang).toBe("zh-CN");
    expect((cap()[0].u.voice as { lang: string }).lang.startsWith("zh")).toBe(true);
  });
});

describe("speech: speakZh 静音语义", () => {
  beforeEach(() => {
    cap().length = 0;
    setSoundOn(true);
  });
  afterEach(() => setSoundOn(true));

  it("默认受音效开关约束（提示语语义：关卡完成/导航标签）", async () => {
    setSoundOn(false);
    await speakZh("关卡完成，太棒了");
    expect(cap().length).toBe(0);
  });

  it("bypassMute 时静音也朗读（学习内容语义：角色介绍/技能/常用语）", async () => {
    setSoundOn(false);
    await speakZh("为了宇宙的和平！", 1, { bypassMute: true });
    expect(cap().length).toBe(1);
  });

  it("stopSpeaking 会取消进行中的 TTS", () => {
    const cancel = vi.spyOn(globalThis.window.speechSynthesis as any, "cancel");
    speakZh("你好"); // 不 await，朗读进行中
    stopSpeaking();
    expect(cancel).toHaveBeenCalled();
  });
});

describe("speech: Chrome 竞态（点了 A 却听到 B）回归", () => {
  beforeEach(() => {
    cap().length = 0;
    setSoundOn(true);
  });
  afterEach(() => setSoundOn(true));

  it("快速连点：先到的请求作废，最终只有后到的发声", async () => {
    const pA = speakZh("旧内容");
    const pB = speakZh("新内容");
    await Promise.all([pA, pB]);
    // 等两个 60ms 延迟发声窗口都走完
    await new Promise((r) => setTimeout(r, 140));
    expect(cap().filter((x) => x.u.text === "旧内容")).toHaveLength(0);
    expect(cap().filter((x) => x.u.text === "新内容")).toHaveLength(1);
  });

  it("stopSpeaking 立即结算挂起的朗读 Promise（不等 12s 超时兜底）", async () => {
    const p = speakZh("内容");
    stopSpeaking();
    const result = await Promise.race([
      p.then(() => "resolved"),
      new Promise((r) => setTimeout(() => r("timeout"), 300)),
    ]);
    expect(result).toBe("resolved");
  });

  it("停止后再点：旧内容绝不再补发（延迟窗口被作废）", async () => {
    speakZh("旧内容");
    stopSpeaking();
    await new Promise((r) => setTimeout(r, 100)); // 越过 60ms 延迟窗口
    expect(cap().filter((x) => x.u.text === "旧内容")).toHaveLength(0);
  });
});

describe("speech: mp3 3s 超时降级（声音系统重构 2026-10-12）", () => {
  /**
   * 挂起不发声的 Audio 假类：play() 永悬、不发 playing/timeupdate/error，
   * 模拟"mp3 加载卡住/404 未触发 onerror"场景；可手动 triggerPlaying 模拟正常出声。
   */
  class FakeAudio {
    static instances: FakeAudio[] = [];
    src = "";
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    listeners: Record<string, (() => void)[]> = {};
    constructor() {
      FakeAudio.instances.push(this);
    }
    addEventListener(type: string, fn: () => void) {
      (this.listeners[type] ||= []).push(fn);
    }
    play() {
      // 永不 resolve、不触发任何事件（= 资源挂起）
      return new Promise(() => {});
    }
    pause() {
      /* noop */
    }
    triggerPlaying() {
      for (const fn of this.listeners.playing || []) fn();
    }
  }

  beforeEach(() => {
    cap().length = 0;
    FakeAudio.instances.length = 0;
    vi.stubGlobal("Audio", FakeAudio);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mp3 3 秒内未开始播放 → 降级原生 TTS（不再 10s 无条件算成功）", async () => {
    // l4 的 blue 在注册表有预生成 mp3（asset 拼接路径，不判存在）→ 走 playAudio
    const p = speak("blue", { lessonId: "l4", wordId: "blue" });
    // 播放链路在 60ms 延迟 speak 前，需要先推进过 playAudio 超时窗口
    await vi.advanceTimersByTimeAsync(3100);
    await p;
    // 超时降级：TTS 兜底发出声音
    expect(cap().map((x) => x.u.text)).toContain("blue");
  });

  it("mp3 3 秒内开始播放 → 保持 mp3，不降级 TTS", async () => {
    const p = speak("blue", { lessonId: "l4", wordId: "blue" });
    // 1s 内开始出声（playing 触发）
    await vi.advanceTimersByTimeAsync(100);
    FakeAudio.instances[0]?.triggerPlaying();
    await vi.advanceTimersByTimeAsync(4000);
    await p;
    // 已开始播放：全程不降级到 TTS
    expect(cap()).toHaveLength(0);
  });
});
