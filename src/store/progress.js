/**
 * 学习进度（localStorage 持久化）
 * stars: { [lessonId]: { learn: 0-3, quiz: 0-3, match: 0-3, speak: 0-3, song: 0|1, talk: 0|1 } }
 *
 * 注意：KEY 里的 kids-english 是**历史存储键名**，不要跟着应用显示名一起改。
 * 改了会读不到已有数据，孩子攒的星星就全没了。
 */
import { reactive } from "vue";

const KEY = "kids-english-progress-v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const state = {
  /**
   * 必须用 reactive 包装：LessonView/HomePage 里的 computed 依赖它，
   * 普通对象不会建立响应式依赖，进度更新后 computed 缓存永不失效
   * （表现为"唱完童谣返回菜单进度条不涨"）。
   */
  progress: reactive(load()),
  get totalStars() {
    return Object.values(this.progress).reduce(
      (sum, l) =>
        sum +
        (l.learn || 0) + (l.quiz || 0) + (l.match || 0) + (l.speak || 0) +
        (l.song || 0) + (l.talk || 0),
      0
    );
  },
  lessonStars(id) {
    const l = this.progress[id];
    if (!l) return 0;
    return (
      (l.learn || 0) + (l.quiz || 0) + (l.match || 0) + (l.speak || 0) +
      (l.song || 0) + (l.talk || 0)
    );
  },
  setGameStars(id, game, stars) {
    const prev = this.progress[id] || {};
    if ((prev[game] || 0) < stars) prev[game] = stars;
    prev.completed = prev.completed || [];
    if (!prev.completed.includes(game)) prev.completed.push(game);
    this.progress[id] = prev;
    this.save();
  },
  markSong(id) {
    const prev = this.progress[id] || {};
    prev.song = 1;
    // 童谣也计入"完成过的玩法"：否则唱完歌返回菜单，进度条/通关判断不涨，
    // 孩子看着"玩了但没进度"会觉得不对劲。
    prev.completed = prev.completed || [];
    if (!prev.completed.includes("song")) prev.completed.push("song");
    this.progress[id] = prev;
    this.save();
  },
  isCompleted(id) {
    const l = this.progress[id];
    return !!(l && l.completed && l.completed.length >= 3);
  },
  save() {
    localStorage.setItem(KEY, JSON.stringify(this.progress));
  },
  reset() {
    this.progress = {};
    localStorage.removeItem(KEY);
  }
};

export default state;
