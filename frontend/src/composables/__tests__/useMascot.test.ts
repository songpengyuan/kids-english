// @vitest-environment jsdom
/**
 * 吉祥物「乐乐鸟」全局状态（useMascot 单例，speech.ts 模式）：
 *  - say：气泡/情绪/popup/voice 四元组，TTL 自动离场，重复 say 重置计时；
 *  - 事件助手：cheer/oops/chest/greet/idleChatter 各归其池，同池连着两次不重样；
 *  - 语音纪律：voice:false 不朗读——结算庆祝让位给结算页报星（4d5cb86），
 *    两句中文 TTS 背靠背会互相打断。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../services/speech", () => ({ speakZh: vi.fn() }));
import { speakZh } from "../../services/speech";
import { useMascot, __resetMascotState } from "../useMascot";
import { MASCOT_LINES } from "../../data/mascotLines";

beforeEach(() => {
  vi.useFakeTimers();
  __resetMascotState();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useMascot · say 基础行为", () => {
  it("say：气泡+情绪+popup 出场，speakZh 朗读，TTL 后自动离场", () => {
    const m = useMascot();
    m.say("太棒啦", { mood: "cheer" });
    expect(m.bubble.value).toBe("太棒啦");
    expect(m.mood.value).toBe("cheer");
    expect(m.popupActive.value).toBe(true);
    // 角色音色：鸟的语音带 MASCOT_VOICE 参数（rate 1.05 / pitch 1.4），与全站 1.1 区分
    expect(speakZh).toHaveBeenCalledWith("太棒啦", 1.05, { pitch: 1.4 });
    vi.advanceTimersByTime(2600);
    expect(m.bubble.value).toBe("");
    expect(m.popupActive.value).toBe(false);
    expect(m.mood.value).toBe("idle");
  });

  it("say popup:false：只出气泡不触发事件出场（dock 页问候/闲聊）", () => {
    const m = useMascot();
    m.say("你好呀", { popup: false });
    expect(m.bubble.value).toBe("你好呀");
    expect(m.popupActive.value).toBe(false);
  });

  it("say voice:false：不朗读（结算庆祝让位给结算页报星）", () => {
    const m = useMascot();
    m.say("关卡完成，太棒了", { voice: false });
    expect(m.bubble.value).toBe("关卡完成，太棒了");
    expect(speakZh).not.toHaveBeenCalled();
  });

  it("重复 say 重置 TTL（后一条覆盖前一条）", () => {
    const m = useMascot();
    m.say("第一条", { ttl: 1000 });
    vi.advanceTimersByTime(800);
    m.say("第二条", { ttl: 2600 });
    vi.advanceTimersByTime(800);
    expect(m.bubble.value).toBe("第二条"); // 第一条的 1000ms 到点也不清
    vi.advanceTimersByTime(1800);
    expect(m.bubble.value).toBe("");
  });
});

describe("useMascot · 事件助手", () => {
  it("cheer/oops/chest/greet/idleChatter 各说各池的话", () => {
    const m = useMascot();
    // greet 最先（初始态 popupActive=false）：问候不该触发飞入
    m.greet();
    expect(MASCOT_LINES.greet).toContain(m.bubble.value);
    expect(m.popupActive.value).toBe(false);
    m.cheer();
    expect(MASCOT_LINES.cheer).toContain(m.bubble.value);
    expect(m.mood.value).toBe("cheer");
    m.oops();
    expect(MASCOT_LINES.oops).toContain(m.bubble.value);
    expect(m.mood.value).toBe("oops");
    m.chest();
    expect(MASCOT_LINES.chest).toContain(m.bubble.value);
    m.idleChatter();
    expect(MASCOT_LINES.tap).toContain(m.bubble.value);
    expect(m.mood.value).toBe("idle");
  });

  it("同池连着两次不重样（avoid 上一条）", () => {
    const m = useMascot();
    m.idleChatter();
    const first = m.bubble.value;
    m.idleChatter();
    expect(m.bubble.value).not.toBe(first);
    expect(speakZh).toHaveBeenCalledTimes(2);
  });

  it("话术池每池至少 4 条（轮换需要）", () => {
    for (const lines of Object.values(MASCOT_LINES)) {
      expect(lines.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("useMascot · oopsVoice（舞台鸟皮肤的纯语音打气）", () => {
  it("只出语音：不设气泡、不触发浮层飞入（避免与舞台鸟同框）", () => {
    const m = useMascot();
    m.oopsVoice();
    expect(m.bubble.value).toBe(""); // 没有气泡
    expect(m.popupActive.value).toBe(false); // 没有浮层
    // 带角色音色（rate/pitch 与 say 一致）
    const call = vi.mocked(speakZh).mock.calls[0];
    expect(call?.[0]).toBeTruthy();
    expect(call?.[1]).toBe(1.05);
    expect(call?.[2]).toMatchObject({ pitch: 1.4 });
  });
});
