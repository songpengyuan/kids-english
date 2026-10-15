"""Pydantic 请求/响应模型（v1 API）。

响应模型即前后端契约（写入 OpenAPI /openapi.json）：
前端类型由 openapi-typescript 从该文件生成，删除手写 mock/映射对齐。
"""
from typing import Any, Literal

from pydantic import BaseModel, Field

# ---------- 请求 ----------

class RegisterIn(BaseModel):
    family_name: str = Field(min_length=1, max_length=20)
    passcode: str = Field(min_length=4, max_length=20)


class LoginIn(BaseModel):
    family_name: str = Field(min_length=1, max_length=20)
    passcode: str = Field(min_length=4, max_length=20)


class ChildIn(BaseModel):
    name: str = Field(min_length=1, max_length=20)
    avatar: str | None = None


class ProgressIn(BaseModel):
    """进度上报：{lessonId: {...}} + 可选 meta（_daily/_last/_dailyLog）。"""
    data: dict
    meta: dict | None = None


# ---------- 响应（契约） ----------

Tone = Literal["blue", "green", "orange", "purple", "pink", "teal"]
LessonType = Literal["official", "bonus"]


class ChildOut(BaseModel):
    id: int
    name: str
    avatar: str | None = None


class RegisterOut(BaseModel):
    ok: bool = True
    token: str
    family_id: int


class LoginOut(BaseModel):
    ok: bool = True
    token: str
    family_id: int
    family_name: str
    children: list[ChildOut] = []


class MeOut(BaseModel):
    ok: bool = True
    family_id: int
    family_name: str
    children: list[ChildOut] = []


class ChildCreatedOut(BaseModel):
    ok: bool = True
    child: ChildOut


class TimingOut(BaseModel):
    bpm: float
    beatsPerBar: int
    duration: float
    timeline: list[float]


class SongOut(BaseModel):
    audio: str | None = None
    video: str | None = None
    scene: str = "stage"
    lyrics: list[str] = []
    timings: TimingOut | None = None


class WordOut(BaseModel):
    id: str
    en: str
    zh: str
    emoji: str = ""
    image: str | None = None
    audio: str | None = None


class PhraseOut(BaseModel):
    en: str
    zh: str
    audio: str = ""


class LessonOut(BaseModel):
    id: str
    title: str
    titleZh: str
    emoji: str = ""
    tone: Tone = "blue"
    type: LessonType = "official"
    date: str | None = None
    song: SongOut
    words: list[WordOut] = []
    phrases: list[PhraseOut] = []


class LessonSummaryOut(BaseModel):
    id: str
    order_no: int
    title: str
    title_zh: str
    emoji: str = ""
    tone: Tone = "blue"
    type: LessonType = "official"
    date: str | None = None


class LessonsOut(BaseModel):
    ok: bool = True
    lessons: list[LessonSummaryOut] = []


class LessonDetailOut(BaseModel):
    ok: bool = True
    lesson: LessonOut


class ProgressOut(BaseModel):
    ok: bool = True
    data: dict[str, Any] = {}
    meta: dict[str, Any] = {}


class ProgressPutOut(BaseModel):
    ok: bool = True


class PongOut(BaseModel):
    ok: bool = True
    msg: str
