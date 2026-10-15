// @vitest-environment jsdom
/**
 * 应用入口门禁 store（stores/gate.ts）单元测试。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useGateStore, GATE_TTL_MS } from "../gate";

describe("useGateStore（应用入口口令门禁）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("初始态：未设置、未解锁", () => {
    const gate = useGateStore();
    expect(gate.isSetup).toBe(false);
    expect(gate.isUnlocked).toBe(false);
  });

  it("setup 后已设置并解锁（持久化）", async () => {
    const gate = useGateStore();
    await gate.setup("1234");
    expect(gate.isSetup).toBe(true);
    expect(gate.isUnlocked).toBe(true);
    // 新实例（模拟刷新）从 localStorage 恢复
    const g2 = useGateStore();
    expect(g2.isSetup).toBe(true);
    expect(g2.isUnlocked).toBe(true);
  });

  it("verify：正确口令解锁并持久化，错误口令拒绝", async () => {
    const gate = useGateStore();
    await gate.setup("abcd");
    expect(await gate.verify("wrong")).toBe(false);
    expect(gate.isUnlocked).toBe(true); // setup 已解锁；错误口令不改状态
    expect(await gate.verify("abcd")).toBe(true);
    expect(gate.isUnlocked).toBe(true);
    // 新实例（模拟刷新）：解锁态持久化
    const g2 = useGateStore();
    expect(g2.isUnlocked).toBe(true);
  });

  it("解锁 7 天后过期，需重新输入口令", async () => {
    const gate = useGateStore();
    await gate.setup("1234");
    // 模拟时间推移：把存储中的解锁时间改为 8 天前，并重建 store（模拟重启）
    const st = JSON.parse(localStorage.getItem("kc-app-gate")!);
    st.unlockedAt = Date.now() - (GATE_TTL_MS + 24 * 3600 * 1000);
    localStorage.setItem("kc-app-gate", JSON.stringify(st));
    setActivePinia(createPinia());
    const expired = useGateStore();
    expect(expired.isUnlocked).toBe(false);
    expect(await expired.verify("1234")).toBe(true);
    expect(expired.isUnlocked).toBe(true);
  });

  it("reset 清除口令与解锁态", async () => {
    const gate = useGateStore();
    await gate.setup("1234");
    gate.reset();
    expect(gate.isSetup).toBe(false);
    expect(gate.isUnlocked).toBe(false);
  });

  it("setPasscode 修改口令后旧口令失效", async () => {
    const gate = useGateStore();
    await gate.setup("aaaa");
    await gate.setPasscode("bbbb");
    expect(await gate.verify("aaaa")).toBe(false);
    expect(await gate.verify("bbbb")).toBe(true);
  });
});
