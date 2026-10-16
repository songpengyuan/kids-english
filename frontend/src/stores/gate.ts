/**
 * 应用入口门禁 store（后端校验 + 自动登录）。
 *
 * 背景：zelab.cn 备案为「闲思杂记」个人站，学习应用藏于 /app/ 子路径。
 * 为不让普通访客/审核直接看到学习内容，进入应用前必须输入**约定口令**：
 *  - 口令由家长约定（家长手机号），后端环境变量 KIDS_GATE_PASSCODE 配置；
 *  - 口令即登录凭证：验证成功 = 自动登录默认家庭，一次输入完成进门 + 登录；
 *  - 输入正确即解锁（本设备记住，7 天内免输；过期后需重新输入）；
 *  - 家长可在「家长中心 → 设置 → 应用口令」开/关门禁（默认开启）。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { request, setToken, setFamilyName } from "../services/api";

const GATE_KEY = "kc-app-gate";
const GATE_ENABLED_KEY = "kc-app-gate-enabled";
/** 解锁有效期：7 天 */
export const GATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface GateState {
  /** 解锁时间戳（ms）；0 = 永久解锁（旧版布尔语义的兼容值） */
  unlockedAt: number | null;
}

function loadUnlockedAt(): number | null {
  try {
    const raw = localStorage.getItem(GATE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<GateState> & { unlocked?: boolean };
    if (typeof data.unlockedAt === "number") return data.unlockedAt;
    if (data.unlocked === true) return 0;
    return null;
  } catch {
    return null;
  }
}

interface GateVerifyOut {
  ok: boolean;
  token: string;
  family_id: number;
  family_name: string;
  email: string | null;
  nickname: string;
  children: unknown[];
}

export const useGateStore = defineStore("gate", () => {
  /** 门禁是否开启（家长中心可关，持久化；默认开） */
  const enabled = ref(localStorage.getItem(GATE_ENABLED_KEY) !== "off");
  /** 解锁时间戳（null=未解锁；0=永久） */
  const unlockedAt = ref<number | null>(loadUnlockedAt());

  /** 局域网/本地开发自动放行（后端没起或前端独立调试时不卡门） */
  function isLocalOrigin(): boolean {
    if (typeof location === "undefined") return false;
    const h = location.hostname;
    return (
      h === "localhost" || h === "127.0.0.1" ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)
    );
  }

  const isUnlocked = computed(
    () =>
      !enabled.value ||
      isLocalOrigin() ||
      (unlockedAt.value !== null &&
        (unlockedAt.value === 0 || Date.now() - unlockedAt.value < GATE_TTL_MS)),
  );

  function persist(): void {
    if (unlockedAt.value === null) {
      localStorage.removeItem(GATE_KEY);
      return;
    }
    localStorage.setItem(GATE_KEY, JSON.stringify({ unlockedAt: unlockedAt.value } satisfies GateState));
  }

  /**
   * 验证口令（后端校验）：
   *  - 调 POST /auth/gate，成功后存 JWT（= 登录）并解锁门禁；
   *  - 口令错误 / 后端不可用 → 返回 false（不降级放行，fail closed）。
   */
  async function verify(pass: string): Promise<boolean> {
    if (!enabled.value) return true;
    if (isLocalOrigin()) {
      unlockedAt.value = Date.now();
      persist();
      return true;
    }
    try {
      const res = await request<GateVerifyOut>(
        "/auth/gate",
        { method: "POST", body: { passcode: pass }, auth: false },
      );
      setToken(res.token);
      setFamilyName(res.family_name);
      unlockedAt.value = Date.now();
      persist();
      return true;
    } catch {
      return false;
    }
  }

  /** 家长开/关门禁（关闭即解除解锁态；重新开启后需再次输入口令） */
  function setEnabled(on: boolean): void {
    enabled.value = on;
    localStorage.setItem(GATE_ENABLED_KEY, on ? "on" : "off");
    if (!on) {
      unlockedAt.value = null;
      persist();
    }
  }

  return { enabled, isUnlocked, verify, setEnabled };
});
