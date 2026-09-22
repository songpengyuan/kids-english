/**
 * 学习进度（localStorage 持久化）
 * stars: { [lessonId]: { learn: 0-3, quiz: 0-3, match: 0-3, song: 0|1 } }
 */
const KEY = "kids-english-progress-v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const state = {
  progress: load(),
  get totalStars() {
    return Object.values(this.progress).reduce(
      (sum, l) =>
        sum +
        (l.learn || 0) + (l.quiz || 0) + (l.match || 0) + (l.speak || 0) + (l.song || 0),
      0
    );
  },
  lessonStars(id) {
    const l = this.progress[id];
    if (!l) return 0;
    return (
      (l.learn || 0) + (l.quiz || 0) + (l.match || 0) + (l.speak || 0) + (l.song || 0)
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
