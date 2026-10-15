/**
 * 到期队列映射：丢掉词库里已不存在的"孤儿词"，保持队列顺序。
 */
import { describe, expect, it } from "vitest";
import { dueWords } from "../reviewQueue";

const pool = [
  { id: "sailor", lessonId: "l4", en: "sailor" },
  { id: "violin", lessonId: "l5", en: "violin" },
];

function item(lessonId: string, wordId: string) {
  return { lessonId, wordId, stage: 0, dueAt: 0, correct: 0, wrong: 1, seen: 0 };
}

describe("dueWords", () => {
  it("按队列顺序返回词面对象", () => {
    const out = dueWords([item("l5", "violin"), item("l4", "sailor")], pool);
    expect(out.map((w) => w.id)).toEqual(["violin", "sailor"]);
  });

  it("词库里没有的词（课程已删除的残留数据）被丢弃", () => {
    const out = dueWords([item("l4", "boat"), item("l4", "sailor")], pool);
    expect(out.map((w) => w.id)).toEqual(["sailor"]);
  });

  it("同 id 不同课不串（复合匹配 lessonId）", () => {
    const dupPool = [
      { id: "blue", lessonId: "l4" },
      { id: "blue", lessonId: "l6" },
    ];
    const out = dueWords([item("l6", "blue")], dupPool);
    expect(out).toHaveLength(1);
    expect(out[0].lessonId).toBe("l6");
  });
});
