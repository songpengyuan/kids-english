/**
 * 应用入口门禁 store（备案域名访问门禁）。
 *
 * 背景：zelab.cn 备案为「闲思杂记」个人站，学习应用藏于 /app/ 子路径。
 * 为不让普通访客/审核直接看到学习内容，进入应用前必须输入**固定约定口令**：
 *  - 口令由家长约定（本实现为家长手机号），访问者无法自行设置/修改；
 *  - 口令明文不落仓库（公开仓库防泄露），代码只存 SHA-256 哈希（反推不出明文）；
 *  - 输入正确即解锁（本设备记住，7 天内免输；过期后需重新输入——
 *    孩子每次重新输入顺便记下家长电话）；
 *  - 家长可在「家长中心 → 设置 → 应用口令」开/关门禁（默认开启）。
 *
 * 这是「体验层门禁」：防止随便访问，不是高安全机制（哈希可被技术手段比对，懂技术可绕过）。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const GATE_KEY = "kc-app-gate";
const GATE_ENABLED_KEY = "kc-app-gate-enabled";
/** 解锁有效期：7 天（孩子隔段时间重新输入口令，顺便记住家长电话） */
export const GATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 固定约定口令的 SHA-256 哈希（"kc-gate:" + 口令）。
 * 明文不写入代码/仓库；要改口令：在本地算好新哈希替换此常量即可。
 * 当前对应：家长手机号（11 位）。
 */
export const FIXED_PASS_HASH =
  "sha256:e6a8c14d1773c7c64182c42bbff7b17c3688d20eb28fc062d5fb004d1ed28173";

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
    if (data.unlocked === true) return 0; // 兼容旧版 { pass, unlocked: boolean }
    return null;
  } catch {
    return null;
  }
}

/** SHA-256 哈希；crypto.subtle 仅安全上下文可用，否则降级明文（前缀区分） */
async function hashPass(pass: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode("kc-gate:" + pass),
      );
      return "sha256:" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      /* 降级 */
    }
  }
  return "plain:" + pass;
}

export const useGateStore = defineStore("gate", () => {
  /** 门禁是否开启（家长中心可关，持久化；默认开） */
  const enabled = ref(localStorage.getItem(GATE_ENABLED_KEY) !== "off");
  /** 解锁时间戳（null=未解锁；0=永久） */
  const unlockedAt = ref<number | null>(loadUnlockedAt());

  /** 局域网/本地开发自动放行：HTTP 下 crypto.subtle 不可用，sha256 校验跑不了 */
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

  /** 验证固定口令：正确 → 解锁并持久化 */
  async function verify(pass: string): Promise<boolean> {
    if (!enabled.value) return true;
    if (isLocalOrigin()) {
      unlockedAt.value = Date.now();
      persist();
      return true;
    }
    if ((await hashPass(pass)) !== FIXED_PASS_HASH) return false;
    unlockedAt.value = Date.now();
    persist();
    return true;
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
