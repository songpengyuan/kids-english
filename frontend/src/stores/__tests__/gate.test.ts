// @vitest-environment jsdom
/**
 * 应用入口门禁 store（stores/gate.ts）单元测试。
 * 固定约定口令模式：访问者只能输入约定口令，无法自行设置/修改。
 * 注：正确口令的解锁路径为端到端验证（浏览器实测），此处不落明文口令。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useGateStore, GATE_TTL_MS, FIXED_PASS_HASH } from "../gate";

describe("useGateStore（应用入口固定口令门禁）", () => {
  beforeEach(() => {
    // 模拟生产环境（非局域网 HTTPS）：局域网/本地 HTTP 下 store 会自动放行，
    // 口令校验路径只在非本地 origin 上生效（53e697b 起的 isLocalOrigin 放行）。
    Object.defineProperty(window, "location", {
      value: { hostname: "zelab.cn", protocol: "https:", href: "https://zelab.cn/app/" },
      configurable: true,
      writable: true,
    });
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("固定口令哈希已配置且为 SHA-256（明文不入库）", () => {
    expect(FIXED_PASS_HASH).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("初始态：门禁开启、未解锁", () => {
    const gate = useGateStore();
    expect(gate.enabled).toBe(true);
    expect(gate.isUnlocked).toBe(false);
  });

  it("错误口令被拒绝，不解锁", async () => {
    const gate = useGateStore();
    expect(await gate.verify("0000")).toBe(false);
    expect(await gate.verify("wrong")).toBe(false);
    expect(gate.isUnlocked).toBe(false);
  });

  it("setEnabled(false) 关闭门禁后直进，重新开启后需再输入", async () => {
    const gate = useGateStore();
    gate.setEnabled(false);
    expect(gate.isUnlocked).toBe(true); // 门禁关闭 = 放行
    gate.setEnabled(true);
    expect(gate.isUnlocked).toBe(false); // 重新开启 = 需输入口令
  });

  it("门禁开关持久化（刷新后仍为关闭）", () => {
    const gate = useGateStore();
    gate.setEnabled(false);
    setActivePinia(createPinia());
    expect(useGateStore().enabled).toBe(false);
  });

  it("解锁 7 天后过期，需重新输入口令", () => {
    // 模拟 8 天前的解锁时间戳 → 新实例判定为未解锁
    localStorage.setItem(
      "kc-app-gate",
      JSON.stringify({ unlockedAt: Date.now() - (GATE_TTL_MS + 24 * 3600 * 1000) }),
    );
    setActivePinia(createPinia());
    expect(useGateStore().isUnlocked).toBe(false);
  });

  it("7 天内的解锁时间戳 → 仍为已解锁", () => {
    localStorage.setItem(
      "kc-app-gate",
      JSON.stringify({ unlockedAt: Date.now() - GATE_TTL_MS + 60 * 1000 }),
    );
    setActivePinia(createPinia());
    expect(useGateStore().isUnlocked).toBe(true);
  });
});
