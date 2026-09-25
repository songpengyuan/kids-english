/**
 * layout.js 纯函数测试：网格容量 / 列数挑选 / 均衡分组。
 * 布局算法是"一屏装下"承诺的核心，任何改动必须过这里。
 */
import { describe, expect, it } from "vitest";
import { fitGrid, pickColumns, splitBalanced } from "../layout";

describe("fitGrid", () => {
  it("按最小可读尺寸反推行列数与每页容量", () => {
    expect(fitGrid({ width: 800, height: 400, minCardW: 170, minCardH: 120 })).toEqual({
      cols: 4,
      rows: 3,
      perPage: 12
    });
  });

  it("宽高为 0（尚未测量）时兜底为 1x1，不崩溃", () => {
    expect(fitGrid({ width: 0, height: 0, minCardW: 170, minCardH: 120 })).toEqual({
      cols: 1,
      rows: 1,
      perPage: 1
    });
  });

  it("maxCols / maxRows 兜住上限（iPad 不挤成一排）", () => {
    expect(
      fitGrid({ width: 2000, height: 2000, minCardW: 170, minCardH: 120, maxCols: 5, maxRows: 2 })
    ).toEqual({ cols: 5, rows: 2, perPage: 10 });
  });
});

describe("pickColumns", () => {
  const base = { width: 800, height: 400, count: 5, minCardW: 130, minCardH: 96, gap: 12, maxCols: 5, maxRows: 4, targetAspect: 1.25 };

  it("常规横屏：挑长宽比最接近目标的列数（3x2）", () => {
    expect(pickColumns(base)).toEqual({ cols: 3, rows: 2 });
  });

  it("高屏不会被算成单列超宽横幅（2x3 更均衡）", () => {
    expect(pickColumns({ ...base, height: 1200 })).toEqual({ cols: 2, rows: 3 });
  });

  it("屏幕过小无完全可读候选：按行数上限兜底，不溢出", () => {
    expect(pickColumns({ ...base, width: 300, height: 200 })).toEqual({ cols: 1, rows: 1 });
  });
});

describe("splitBalanced", () => {
  it("少于等于最大组 → 一组原样返回", () => {
    expect(splitBalanced([1, 2, 3, 4, 5])).toEqual([[1, 2, 3, 4, 5]]);
  });

  it("均分成 k 组，每组落在 min~max（8 项 → 4+4）", () => {
    expect(splitBalanced([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8]
    ]);
  });

  it("13 项 → 5+4+4", () => {
    expect(splitBalanced([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9],
      [10, 11, 12, 13]
    ]);
  });
});
