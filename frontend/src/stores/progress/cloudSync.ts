/**
 * 云同步状态机（P0：进度上云）。
 *
 * 生命周期：本地变更 → save() → noteSaved()（置 dirty + 3s 防抖）→ pushReport()（PUT 全量）
 * → 成功清 dirty / 失败置 error（下次变更自动重试）。
 * 心跳（App.vue）调 flushIfDirty()：只有存在未上报变更才发请求，无变更零请求。
 * 后端不可用时这里是纯本地模式（activeChildId() = null 全部短路），孩子正常玩。
 */
import { ref, type Ref } from "vue";
import { getToken, requestWithTimeout } from "../../services/api";
import type { components } from "../../types/api";
import { useAuthStore } from "../auth";
import {
  isLessonKey,
  maxSnapshot,
  type DailySnapshot,
  type DailyStats,
  type LessonProgress,
  type ProgressMap,
} from "./shared";

export interface CloudSyncDomain {
  /** idle 未同步 / syncing 进行中 / done 已同步 / error 失败待重试 */
  cloudState: Ref<"idle" | "syncing" | "done" | "error">;
  syncFromServer: () => Promise<void>;
  /** save() 之后调用：置 dirty 并起 3s 防抖上报 */
  noteSaved: () => void;
  flushReport: () => Promise<void>;
  flushIfDirty: () => Promise<void>;
}

export function createCloudSync(progress: ProgressMap): CloudSyncDomain {
  const cloudState = ref<"idle" | "syncing" | "done" | "error">("idle");
  /** 距离上次上报的时间戳（防抖用） */
  let lastReportAt = 0;
  let reportTimer: ReturnType<typeof setTimeout> | null = null;
  const REPORT_DEBOUNCE_MS = 3000;
  /** 是否有本地变更未上云（save 置 true，pushReport 成功置 false；心跳同步据此跳过空请求） */
  let dirty = false;

  /** 当前孩子 id（未登录/未选孩子返回 null → 纯本地模式） */
  function activeChildId(): number | null {
    if (!getToken()) return null;
    return useAuthStore().currentChildId ?? null;
  }

  /**
   * 从后端拉取当前孩子全量进度并合并：
   * - 服务端有、本地没有的课程/元数据 → 补入（多设备首次同步）；
   * - 本地已有 → 保留本地（活跃设备的最新状态优先）。
   * - 时长类元数据（_daily / _dailyLog）例外：**同键取 max**。
   *   设备 B 刚打开时本地是「今天 0 分钟」，若按"本地优先"，就会一直显示 0，
   *   云端设备 A 已累计的时长永远进不来（这正是"同一口令两台设备看到两套数据"的成因）。
   */
  async function syncFromServer(): Promise<void> {
    const childId = activeChildId();
    if (childId === null || cloudState.value === "syncing") return;
    cloudState.value = "syncing";
    try {
      const res = await requestWithTimeout<components["schemas"]["ProgressOut"]>(
        `/children/${childId}/progress`,
      );
      if (res.ok) {
        const data = (res.data ?? {}) as Record<string, LessonProgress>;
        const meta = (res.meta ?? {}) as {
          _daily: DailyStats | null;
          _last: string | null;
          _dailyLog: Record<string, DailySnapshot>;
        };
        for (const id of Object.keys(data)) {
          if (!(id in progress)) progress[id] = data[id];
        }
        if (meta) {
          // _daily：日期较新的一方胜出；同日期逐字段取 max（跨设备时云端更大时长必须覆盖本地小值）
          const cloudDaily = meta._daily;
          const local = progress._daily;
          if (cloudDaily?.date) {
            if (!local?.date || cloudDaily.date > local.date) {
              progress._daily = cloudDaily;
            } else if (cloudDaily.date === local.date) {
              progress._daily = {
                date: local.date,
                durationSec: Math.max(local.durationSec ?? 0, cloudDaily.durationSec ?? 0),
                activities: Math.max(local.activities ?? 0, cloudDaily.activities ?? 0),
                listenSec: Math.max(local.listenSec ?? 0, cloudDaily.listenSec ?? 0),
              };
            }
          }
          if (!progress._last) progress._last = meta._last ?? null;
          // _dailyLog：逐日取 max（原来 `{...cloud, ...local}` 是本地覆盖云端，
          // 于是设备 B 只为当天打了 1 分钟，设备 A 的 30 分钟就被永远盖住）
          const log = meta._dailyLog ?? {};
          const merged: Record<string, DailySnapshot> = { ...(progress._dailyLog ?? {}) };
          for (const date of Object.keys(log)) {
            merged[date] = merged[date] ? maxSnapshot(merged[date], log[date]) : log[date];
          }
          progress._dailyLog = merged;
        }
        cloudState.value = "done";
      }
    } catch {
      cloudState.value = "error";
    }
  }

  /** 防抖全量上报（3s 内合并多次变更；失败标记 error，下次变更自动重试） */
  function scheduleReport(): void {
    if (activeChildId() === null) return;
    const now = Date.now();
    if (now - lastReportAt < REPORT_DEBOUNCE_MS || reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      void pushReport();
    }, REPORT_DEBOUNCE_MS);
  }

  async function pushReport(): Promise<void> {
    const childId = activeChildId();
    if (childId === null) return;
    lastReportAt = Date.now();
    const data: Record<string, LessonProgress> = {};
    for (const id of Object.keys(progress)) {
      if (!isLessonKey(id)) continue;
      data[id] = progress[id];
    }
    const meta = {
      _daily: progress._daily ?? null,
      _last: progress._last ?? null,
      _dailyLog: progress._dailyLog ?? {},
    };
    try {
      await requestWithTimeout<components["schemas"]["ProgressPutOut"]>(`/children/${childId}/progress`, {
        method: "PUT",
        body: { data, meta },
      });
      cloudState.value = "done";
      dirty = false;
    } catch {
      cloudState.value = "error";
    }
  }

  /** 强制立即上报（页面隐藏/切孩子时调用，缩短数据丢失窗口） */
  async function flushReport(): Promise<void> {
    if (reportTimer) {
      clearTimeout(reportTimer);
      reportTimer = null;
    }
    await pushReport();
  }

  /** 定期心跳：仅当存在未上报变更时立即推一次（无变更零请求；未登录自动跳过） */
  async function flushIfDirty(): Promise<void> {
    if (!dirty) return;
    await flushReport();
  }

  function noteSaved(): void {
    dirty = true;
    scheduleReport();
  }

  return { cloudState, syncFromServer, noteSaved, flushReport, flushIfDirty };
}
