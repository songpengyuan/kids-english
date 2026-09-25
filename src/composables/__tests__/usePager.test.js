// @vitest-environment jsdom
/**
 * usePager 测试：分页切片、边界防御（容量变化夹页码、数据源变化回第一页）。
 * watch 默认异步 flush，断言前需要 await nextTick()。
 */
import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { usePager } from "../usePager";

describe("usePager", () => {
  it("分页与切片、翻页边界", async () => {
    const src = ref([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const p = usePager(src, ref(4));
    expect(p.total.value).toBe(3);
    expect(p.items.value).toEqual([1, 2, 3, 4]);

    p.next();
    await nextTick();
    expect(p.items.value).toEqual([5, 6, 7, 8]);

    p.next();
    expect(p.isLast.value).toBe(true);
    expect(p.items.value).toEqual([9, 10]);

    p.next(); // 已在最后一页，不越界
    expect(p.items.value).toEqual([9, 10]);
    expect(p.percent.value).toBe(100);

    p.prev();
    await nextTick();
    expect(p.rangeText.value).toBe("5-8 / 10");
  });

  it("每页容量变小 → 页码夹回合法范围", async () => {
    const src = ref([1, 2, 3, 4, 5, 6, 7, 8]);
    const perPage = ref(4);
    const p = usePager(src, perPage);
    p.go(1); // 第 2 页
    await nextTick();

    perPage.value = 2;
    await nextTick();
    // 首条映射：page*was=4 → floor(4/2)=2，且 2 < total(4)
    expect(p.page.value).toBe(2);
    expect(p.items.value).toEqual([5, 6]);
  });

  it("容量变大（一页装下全部）→ 不停留在越界页", async () => {
    const src = ref([1, 2, 3, 4, 5, 6]);
    const perPage = ref(3);
    const p = usePager(src, perPage);
    p.go(1);
    await nextTick();

    perPage.value = 6;
    await nextTick();
    expect(p.total.value).toBe(1);
    expect(p.page.value).toBe(0);
    expect(p.items.value).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("数据源变化 → 回到第一页（换课场景）", async () => {
    const src = ref([1, 2, 3]);
    const p = usePager(src, ref(2), { resetOn: [() => src.value.length] });
    p.next();
    await nextTick();
    expect(p.page.value).toBe(1);

    src.value = [5, 6, 7, 8];
    await nextTick();
    expect(p.page.value).toBe(0);
    expect(p.items.value).toEqual([5, 6]);
  });

  it("空数据 → 不崩溃，total 至少为 1", async () => {
    const src = ref([]);
    const p = usePager(src, ref(4));
    expect(p.total.value).toBe(1);
    expect(p.items.value).toEqual([]);
    p.next();
    expect(p.page.value).toBe(0);
  });
});
