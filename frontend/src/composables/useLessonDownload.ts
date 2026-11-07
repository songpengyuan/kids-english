/**
 * 「下载本课离线包」：把一课的音频/词图/视频显式拉进 SW 媒体缓存，
 * 供无网环境（车上/飞机）离线播放。与 SW 的 DOWNLOAD_LESSON 消息通道配套。
 *
 * 双路径：
 *  - SW 可用（navigator.serviceWorker.controller）：在 SW 里下载，
 *    页面切走/刷新不中断，经 MessageChannel 逐条回传进度；
 *  - 不可用（首次加载 SW 还没接管 / 调试环境）：退化为页面内逐个 fetch，
 *    借 SW 的 fetch 拦截（handleMedia）落缓存，没有 SW 时只是不缓存但流程不炸。
 */
import { ref, type Ref } from "vue";
import type { Lesson } from "../data/lessons";

/** 收集一课需要离线的全部媒体 URL：童谣音视频（含多轨）+ 词图 + 词音 + 口语句音。 */
export function collectLessonMedia(lesson: Lesson): string[] {
  const urls: string[] = [];
  const push = (u: string | null | undefined) => {
    if (u && u.startsWith("/") && u.includes("/lessons/") && !urls.includes(u)) urls.push(u);
  };
  push(lesson.song?.audio);
  push(lesson.song?.video);
  for (const t of lesson.song?.tracks ?? []) {
    push(t.audio);
    push(t.video);
  }
  for (const w of lesson.words ?? []) {
    push(w.audio);
    push(w.image);
  }
  for (const p of lesson.phrases ?? []) push(p.audio);
  return urls;
}

export type DownloadState = "idle" | "downloading" | "done" | "error" | "unsupported";

export interface LessonDownload {
  state: Ref<DownloadState>;
  /** loaded/total：以"文件数"计（音频词图都是小文件，视频单算一个） */
  loaded: Ref<number>;
  total: Ref<number>;
  start: (lesson: Lesson) => Promise<void>;
}

export function useLessonDownload(): LessonDownload {
  const state = ref<DownloadState>("idle");
  const loaded = ref(0);
  const total = ref(0);

  /** SW 不可用时的兜底：页面内直接 fetch（经 SW fetch 拦截照常落缓存） */
  async function downloadInPage(urls: string[]) {
    for (const url of urls) {
      try {
        await fetch(url);
      } catch {
        /* 单个失败不中断整批 */
      }
      loaded.value += 1;
    }
    state.value = "done";
  }

  async function start(lesson: Lesson) {
    if (state.value === "downloading") return;
    const urls = collectLessonMedia(lesson);
    total.value = urls.length;
    loaded.value = 0;
    if (!urls.length) {
      state.value = "done";
      return;
    }
    const swc = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
    if (!swc) {
      state.value = "downloading";
      await downloadInPage(urls);
      return;
    }
    state.value = "downloading";
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      let settled = false;
      let watchdog: ReturnType<typeof setTimeout>;
      const finish = (failed: boolean) => {
        clearTimeout(watchdog);
        if (settled) return;
        settled = true;
        if (failed) state.value = "error";
        else state.value = "done";
        resolve();
      };
      // 30s 无任何进展视为失联（SW 被杀），按失败收场（剩余部分下次重下）
      watchdog = setTimeout(() => finish(true), 30000);
      channel.port1.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === "DOWNLOAD_PROGRESS") {
          loaded.value = d.loaded;
          total.value = d.total;
          clearTimeout(watchdog);
          watchdog = setTimeout(() => finish(true), 30000);
        } else if (d.type === "DOWNLOAD_DONE") {
          loaded.value = d.loaded;
          total.value = d.total;
          finish(!!d.fail);
        }
      };
      swc.postMessage({ type: "DOWNLOAD_LESSON", urls }, [channel.port2]);
    });
  }

  return { state, loaded, total, start };
}
