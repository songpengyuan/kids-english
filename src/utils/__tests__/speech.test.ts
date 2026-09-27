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
