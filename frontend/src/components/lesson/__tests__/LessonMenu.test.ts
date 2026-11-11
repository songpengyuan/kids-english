// @vitest-environment jsdom
/**
 * 玩法瓷片名折行（课程详情「卡片目录」视图）：
 * 词群入口名是「学单词·Colors」这类中文+英文混排，窄屏（320/360）下比瓷砖内宽还长，
 * 曾经不换行、文字左右溢出瓷砖；放开换行后又会在「图」和「·」之间断，
 * 出现「听音选图」/「·Animals」这种点为行首的残行。
 * 所以名字按「·」拆成中文半段（含点）+ 词群半段（整段不断行），
 * 换行只可能发生在两段之间 —— 点永远留在第一行。
 */
import { markRaw } from "vue";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LessonMenu from "../LessonMenu.vue";

// icon 是组件本身，props 会被 Vue 变成 reactive，组件必须 markRaw（否则刷 reactive 警告）
const IconStub = markRaw({ template: "<i />" });

function mountMenu(activities: any[]) {
  return mount(LessonMenu, { props: { activities, progress: 0 } });
}

describe("LessonMenu 词群瓷片名折行", () => {
  it("词群入口名按「·」拆成中文半段（含点）+ 词群半段，整名不被截断", () => {
    const w = mountMenu([
      { key: "learn:colors", name: "学单词·Colors", tone: "orange", icon: IconStub },
    ]);
    const name = w.find(".tile-name");
    expect(name.find(".tile-name__head").text()).toBe("学单词·");
    expect(name.find(".tile-name__tail").text()).toBe("Colors");
    expect(name.text()).toBe("学单词·Colors");
  });

  it("没有词群后缀的玩法名不产生空后缀节点（否则会多出一个可断行点）", () => {
    const w = mountMenu([{ key: "song", name: "学童谣", tone: "green", icon: IconStub }]);
    const name = w.find(".tile-name");
    expect(name.find(".tile-name__head").text()).toBe("学童谣");
    expect(name.find(".tile-name__tail").exists()).toBe(false);
  });
});
