/**
 * 应用入口门禁 store（备案域名访问门禁）。
 *
 * 背景：zelab.cn 备案为「闲思杂记」个人站，学习应用藏于 /app/ 子路径。
 * 为不让普通访客/审核直接看到学习内容，进入应用前需家长口令解锁：
 *  - 首次进入：家长设置口令（明文转 SHA-256 存 localStorage，安全上下文不可用时降级明文）；
 *  - 之后：输入口令验证通过即解锁（本设备记住，7 天内免输；过期后需重新输入）；
 *  - 口令常设为家长手机号——孩子每次重新输入时顺便记下家长电话（紧急联系用）；
 *  - 家长可在「家长中心 → 设置 → 应用口令」修改或关闭门禁。
 *
 * 这是「体验层门禁」：防止随便访问，不是高安全机制（口令存本机，懂技术可绕过）。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const GATE_KEY = "kc-app-gate";
/** 解锁有效期：7 天（孩子隔段时间重新输入口令，顺便记住家长电话） */
export const GATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface GateState {
  /** 口令哈希（sha256:hex 或 plain:明文——非安全上下文降级） */
  pass: string;
  /** 解锁时间戳（ms）；0 = 永久解锁（旧版布尔语义的兼容值） */
  unlockedAt: number | null;
}

function load(): GateState | null {
  try {
    const raw = localStorage.getItem(GATE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<GateState> & { unlocked?: boolean };
    // 兼容旧版 { pass, unlocked: boolean }
    const unlockedAt =
      typeof data.unlockedAt === "number" ? data.unlockedAt : data.unlocked === true ? 0 : null;
    return data.pass ? { pass: data.pass, unlockedAt } : null;
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
  /** 口令哈希（null=从未设置） */
  const passHash = ref<string | null>(load()?.pass ?? null);
  /** 解锁时间戳（null=未解锁；0=永久） */
  const unlockedAt = ref<number | null>(load()?.unlockedAt ?? null);

  const isSetup = computed(() => passHash.value !== null);
  const isUnlocked = computed(
    () =>
      unlockedAt.value !== null &&
      (unlockedAt.value === 0 || Date.now() - unlockedAt.value < GATE_TTL_MS),
  );

  function persist(): void {
    if (passHash.value === null) {
      localStorage.removeItem(GATE_KEY);
      return;
    }
    localStorage.setItem(
      GATE_KEY,
      JSON.stringify({ pass: passHash.value, unlockedAt: unlockedAt.value } satisfies GateState),
    );
  }

  /** 首次设置口令（同时解锁本设备） */
  async function setup(pass: string): Promise<void> {
    passHash.value = await hashPass(pass);
    unlockedAt.value = Date.now();
    persist();
  }

  /** 验证口令：正确 → 解锁并持久化 */
  async function verify(pass: string): Promise<boolean> {
    if (passHash.value === null) return false;
    if ((await hashPass(pass)) !== passHash.value) return false;
    unlockedAt.value = Date.now();
    persist();
    return true;
  }

  /** 家长修改口令（需已解锁，直接换哈希；解锁态保留） */
  async function setPasscode(newPass: string): Promise<void> {
    passHash.value = await hashPass(newPass);
    persist();
  }

  /** 关闭门禁（清除口令并解锁态） */
  function reset(): void {
    passHash.value = null;
    unlockedAt.value = null;
    persist();
  }

  return { isSetup, isUnlocked, setup, verify, setPasscode, reset };
});
