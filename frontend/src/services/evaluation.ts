/**
 * 讯飞发音评测（服务端代理）。
 *
 * 前端只负责录 + 转码（见 utils/audio.ts），密钥与 ISE 握手在 backend，
 * 避免 AppSecret 落到客户端。
 *
 * 契约：POST /api/v1/evaluation，multipart：
 *   file = 16k/16bit/单声道 WAV
 *   text = 目标单词/句子
 * 返回 { ok: true, total_score: 0~100, ... } 或 { ok: false, error, msg }
 *
 * 任何失败（超时、网络、服务未配、上游异常）都返回 null —— 调用方一律
 * 降级到家长判定，不让孩子卡在"评分中"。
 */
import { requestWithTimeout } from "./api";

export interface EvaluationWord {
  content: string;
  score?: number | null;
  dp_message?: string | number;
}

export interface EvaluationResult {
  ok: boolean;
  total_score?: number | null;
  accuracy_score?: number | null;
  fluency_score?: number | null;
  integrity_score?: number | null;
  is_rejected?: boolean;
  except_info?: number;
  words?: EvaluationWord[];
  error?: string;
  msg?: string;
}

/** 评测超时上限：连上传带握手约 1.5s，给 12s 余量扛弱网 */
const TIMEOUT_MS = 12000;

export async function evaluatePronunciation(
  wav: Blob,
  text: string,
  opts: { signal?: AbortSignal } = {},
): Promise<EvaluationResult | null> {
  const target = (text || "").trim();
  if (!target || !wav.size) return null;

  const form = new FormData();
  form.append("file", wav, "read.wav");
  form.append("text", target);

  try {
    const res = await requestWithTimeout<EvaluationResult>(
      "/evaluation",
      { method: "POST", formData: form, signal: opts.signal },
      TIMEOUT_MS,
    );
    if (!res || !res.ok) return null;
    if (typeof res.total_score !== "number") return null;
    return res;
  } catch {
    // 网络/超时/401 一律当"拿不到分数"，由调用方降级
    return null;
  }
}
