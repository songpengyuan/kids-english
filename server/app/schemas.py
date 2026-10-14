"""Pydantic 请求/响应模型（v1 API）。"""
from pydantic import BaseModel, Field


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
