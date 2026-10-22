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
    email: str | None = None


class LoginIn(BaseModel):
    """登录二选一：email（新账号通道）或 family_name（存量通道）。"""
    family_name: str | None = Field(default=None, min_length=1, max_length=20)
    email: str | None = None
    passcode: str = Field(min_length=4, max_length=20)


class MePatchIn(BaseModel):
    """家长资料编辑：昵称 / 邮箱（至少一项）。"""
    nickname: str | None = Field(default=None, min_length=1, max_length=20)
    email: str | None = None


class GateIn(BaseModel):
    """应用入口门禁口令：同时作为登录凭证，一次输入完成进门 + 登录。"""
    passcode: str = Field(min_length=4, max_length=20)


class ChildIn(BaseModel):
    name: str = Field(min_length=1, max_length=20)
    avatar: str | None = None
    birth_date: str | None = Field(default=None, max_length=20)


class ChildPatchIn(BaseModel):
    """孩子档案编辑：名/头像/生日（至少一项；缺席=不改，avatar/birth_date 显式 null=清空）。"""
    name: str | None = Field(default=None, min_length=1, max_length=20)
    avatar: str | None = None
    birth_date: str | None = Field(default=None, max_length=20)


class RewardsIn(BaseModel):
    """奖励数据上报：贝壳（>=0）+ 形态星级 + 累计开箱次数。"""
    shells: int = Field(ge=0)
    forms: dict[str, int] = {}
    chestsOpened: int = Field(default=0, ge=0)


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
    birth_date: str | None = None


class ChildrenOut(BaseModel):
    ok: bool = True
    children: list[ChildOut] = []


class RegisterOut(BaseModel):
    ok: bool = True
    token: str
    family_id: int


class LoginOut(BaseModel):
    ok: bool = True
    token: str
    family_id: int
    family_name: str
    email: str | None = None
    nickname: str
    children: list[ChildOut] = []


class GateOut(LoginOut):
    """门禁口令验证成功 = 自动登录默认家庭（复用登录响应结构）。"""
    pass


class MeOut(BaseModel):
    ok: bool = True
    family_id: int
    family_name: str
    email: str | None = None
    nickname: str
    created_at: str
    children: list[ChildOut] = []


class ChildCreatedOut(BaseModel):
    ok: bool = True
    child: ChildOut


class RewardsDataOut(BaseModel):
    shells: int = 0
    forms: dict[str, int] = {}
    chestsOpened: int = 0


class RewardsOut(BaseModel):
    ok: bool = True
    data: RewardsDataOut
    updated_at: str | None = None


class RewardsPutOut(BaseModel):
    ok: bool = True


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
    # 词群（如 l11 的 colors/animals）：配合 LessonOut.wordGroups 分组展示
    group: str | None = None


class WordGroupOut(BaseModel):
    key: str
    name: str


class ColorPairOut(BaseModel):
    """颜色配对（l11 连一连）：左列颜色 ↔ 右列动物词"""
    color: str
    wordId: str


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
    # 学单词玩法样式：cards=看图点读（默认），dialog=亲子口语对话卡（l10）
    stageStyle: str | None = None
    song: SongOut
    words: list[WordOut] = []
    phrases: list[PhraseOut] = []
    # 颜色配对 / 词群（l11 Brown Bear）；其他课为 null
    colorPairs: list[ColorPairOut] | None = None
    wordGroups: list[WordGroupOut] | None = None


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
    # ADR-002：排查时一眼看到生产库的 schema 版本，不用登服务器翻代码
    schema_version: int | None = None


# ---------- 埋点事件（ADR-004）----------

class EventIn(BaseModel):
    """单条客户端事件。client_event_id 由客户端生成，服务端据此幂等去重。"""

    client_event_id: str = Field(min_length=1, max_length=64)
    type: str = Field(min_length=1, max_length=40)
    child_id: int | None = None
    payload: dict[str, Any] | None = None
    client_ts: str | None = None
    app_version: str | None = Field(default=None, max_length=40)


class EventsIn(BaseModel):
    events: list[EventIn] = Field(default_factory=list, max_length=50)


class EventsOut(BaseModel):
    ok: bool = True
    received: int
    accepted: int
