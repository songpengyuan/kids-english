// @vitest-environment jsdom
/**
 * useQuest 行为测试（2026-10-17 本课作用域收口）。
 *
 * 锁死三件事——这三件都是"把总地图直接挪进课程"暴露出来的真实 bug：
 *  1. 关卡序号是本课内的（l4 第 1 关…第 7 关），不是全站累计的「第 8 关」；
 *  2. 「下一关」只在本课内推进，本课最后一个玩法（talk）之后为 null；
 *  3. 从本课地图点进去的单关，序号/下一关与地图节点顺序一致（song 打头）。
 */
import { describe, expect, it } from "vitest";
import { computed, defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter, useRoute } from "vue-router";
import { activityKeys, getLesson, type Lesson } from "../../data/lessons";
import { ACT_NAMES } from "../../data/pathLevels";
import { useQuest, type QuestAct, type UseQuest } from "../useQuest";

/** 按课程玩法顺序构造 activities（与 LessonView 的编排一致） */
function actsOf(lesson: Lesson): QuestAct[] {
  return activityKeys(lesson).map((k) => ({
    key: k,
    name: ACT_NAMES[k] ?? k,
    game: k,
    tone: "blue",
    desc: "",
    icon: undefined as never,
  }));
}

async function boot(url: string): Promise<UseQuest> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/game/quest/:id/:stage?", name: "quest", component: { template: "<div />" } },
      { path: "/course/:id/:stage?", name: "lesson", component: { template: "<div />" } },
      { path: "/", component: { template: "<div />" } },
    ],
  });
  const box: { quest?: UseQuest } = {};
  const Host = defineComponent({
    setup() {
      const lesson = ref<Lesson | null>(getLesson("l4"));
      const activities = computed<QuestAct[]>(() => (lesson.value ? actsOf(lesson.value) : []));
      const route = useRoute();
      box.quest = useQuest({ lesson, activities, route });
      return {};
    },
    template: "<div />",
  });
  mount(Host, { global: { plugins: [createPinia(), router] } });
  await router.push(url);
  await router.isReady();
  return box.quest!;
}

describe("useQuest 作用域", () => {
  it("仅 /game/quest 路由是闯关模式（/course 不是）", async () => {
    expect((await boot("/game/quest/l4?step=song")).questMode.value).toBe(true);
    expect((await boot("/course/l4")).questMode.value).toBe(false);
  });

  it("本课序号从 1 起：song=第 1 关、learn=第 2 关、quiz=第 3 关", async () => {
    const song = await boot("/game/quest/l4?step=song");
    expect(song.bootFromQuery()).toBe(0);
    expect(song.questLevel.value).toBe(1);

    const learn = await boot("/game/quest/l4?step=learn");
    expect(learn.bootFromQuery()).toBe(1);
    expect(learn.questLevel.value).toBe(2);

    const quiz = await boot("/game/quest/l4?step=quiz");
    expect(quiz.bootFromQuery()).toBe(2);
    expect(quiz.questLevel.value).toBe(3);
  });

  it("下一关在本课内推进：song → learn，speak → talk", async () => {
    const song = await boot("/game/quest/l4?step=song");
    song.bootFromQuery();
    expect(song.nextLevel.value).toMatchObject({ lessonId: "l4", actKey: "learn", name: "学单词" });

    const speak = await boot("/game/quest/l4?step=speak");
    speak.bootFromQuery();
    expect(speak.nextLevel.value).toMatchObject({ lessonId: "l4", actKey: "talk", name: "亲子对话" });
  });

  it("本课最后一个玩法（talk）之后没有下一关（不会跨到下一课）", async () => {
    const talk = await boot("/game/quest/l4?step=talk");
    expect(talk.bootFromQuery()).toBe(6);
    expect(talk.nextLevel.value).toBeNull();
  });
});
