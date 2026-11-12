import { describe, expect, it } from "vitest";
import { phraseCoverUrl } from "../phraseCover";

const words = [
  { en: "violin", image: "/lessons/l5/words/violin.webp" },
  { en: "piano", image: "/lessons/l5/words/piano.webp" },
  { en: "squirrel", image: "/lessons/l5/words/squirrel.webp" },
  { en: "bus", image: "/lessons/l12/words/bus.webp" },
  { en: "wheels", image: "/lessons/l12/words/wheels.webp" },
  { en: "afraid", image: "/lessons/l10/words/afraid.webp" },
  { en: "sea", image: "/lessons/l4/words/sea.webp" },
  { en: "brown", image: "/lessons/l11/words/brown.svg" },
];

describe("phraseCoverUrl", () => {
  it("句子里有具体名词时直接复用词图", () => {
    expect(phraseCoverUrl("I can play the piano.", words)).toBe("/lessons/l5/words/piano.webp");
    expect(phraseCoverUrl("I see a squirrel.", words)).toBe("/lessons/l5/words/squirrel.webp");
  });

  it("同一句多个词时取更长的词，避免 bus 抢掉 wheels", () => {
    expect(phraseCoverUrl("The wheels on the bus go round and round.", words)).toBe(
      "/lessons/l12/words/wheels.webp",
    );
  });

  it("not afraid 与 good night 优先走情绪/场景图，不被名词抢走", () => {
    expect(phraseCoverUrl("I'm not afraid.", words)).toContain("/phrases/brave.webp");
    expect(phraseCoverUrl("Good night, Gorilla.", [...words, { en: "gorilla", image: "/g.webp" }])).toContain(
      "/phrases/night.webp",
    );
  });

  it("颜色句统一用调色盘，不用平面色块", () => {
    expect(phraseCoverUrl("It's brown.", words)).toContain("/covers/1f3a8.webp");
  });

  it("纯提问句走通用拟物图，未知句子保留气泡占位", () => {
    expect(phraseCoverUrl("What can you play?", words)).toContain("/phrases/play.webp");
    expect(phraseCoverUrl("What do you see?", words)).toContain("/phrases/look.webp");
    expect(phraseCoverUrl("Today, let's go to the zoo.", words)).toContain("/phrases/zoo.webp");
    expect(phraseCoverUrl("Wave goodbye!", words)).toContain("/phrases/wave.webp");
    expect(phraseCoverUrl("Something else entirely.", words)).toBeNull();
  });

  it("see 不会被 sea 误命中", () => {
    expect(phraseCoverUrl("What do you see?", words)).toContain("/phrases/look.webp");
  });
});
