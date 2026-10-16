"""时间口径单元测试（``app/timeutil.py``）。

这些用例存在的意义：时间口径的 bug 不会让程序崩，只会让**指标悄悄错**，
而且错得很像对的（数值合理、趋势平滑）。所以边界必须被测试钉住。
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.timeutil import (
    TZ_NAME,
    local_day_bounds_utc,
    local_today,
    normalize_client_ts,
    to_sqlite,
)

BACKEND = Path(__file__).resolve().parent.parent


def test_default_tz_is_shanghai():
    assert TZ_NAME == "Asia/Shanghai"


# ---------- 格式归一 ----------
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-10-17T06:31:09.123Z", "2026-10-17 06:31:09"),   # 前端 toISOString() 的真实形状
        ("2026-10-17T06:31:09Z", "2026-10-17 06:31:09"),
        ("2026-10-17T14:31:09+08:00", "2026-10-17 06:31:09"),  # 显式偏移 → 换算到 UTC
        ("2026-10-17 06:31:09", "2026-10-17 06:31:09"),        # 已是库内格式，幂等
        ("2026-10-17T06:31:09", "2026-10-17 06:31:09"),        # 裸串按 UTC（不是本地）
        ("2026-10-17", "2026-10-17 00:00:00"),                 # 纯日期
    ],
)
def test_normalize_client_ts(raw, expected):
    assert normalize_client_ts(raw) == expected


@pytest.mark.parametrize("bad", ["昨天", "not-a-time", "", "   ", None, 123, {}, []])
def test_normalize_client_ts_rejects_garbage(bad):
    """无法解析 → None（由 COALESCE 退回 server_ts），而不是抛异常或猜一个值。"""
    assert normalize_client_ts(bad) is None


def test_normalize_is_idempotent():
    once = normalize_client_ts("2026-10-17T06:31:09.123Z")
    assert normalize_client_ts(once) == once


# ---------- 本地日 → UTC 区间 ----------
def test_local_day_bounds_are_utc_shifted():
    """CST 的一天 = UTC 前一天 16:00 到当天 16:00（半开区间）。"""
    start, end = local_day_bounds_utc("2026-10-17")
    assert start == "2026-10-16 16:00:00"
    assert end == "2026-10-17 16:00:00"


def test_local_day_bounds_cover_exactly_24h():
    from datetime import datetime

    start, end = local_day_bounds_utc("2026-10-17")
    fmt = "%Y-%m-%d %H:%M:%S"
    delta = datetime.strptime(end, fmt) - datetime.strptime(start, fmt)
    assert delta.total_seconds() == 24 * 3600


def test_boundary_instant_belongs_to_the_next_local_day():
    """区间是半开的：恰好落在 end 的瞬间属于**下一天**，不会被两天重复计入。"""
    start, end = local_day_bounds_utc("2026-10-17")
    # 2026-10-17 16:00 UTC == 2026-10-18 00:00 CST → 是 10-18 的第一刻
    assert normalize_client_ts("2026-10-17T16:00:00Z") == end
    next_start, _ = local_day_bounds_utc("2026-10-18")
    assert next_start == end


# ---------- 今天 ----------
def test_local_today_uses_kids_tz_not_process_tz(monkeypatch):
    """UTC 22:00 时，CST 已经是第二天 —— 「今天」必须取 CST 的那一天。"""
    import app.timeutil as tu

    monkeypatch.setenv("TZ", "UTC")
    if hasattr(__import__("time"), "tzset"):
        __import__("time").tzset()
    # 2026-10-16 22:00 UTC == 2026-10-17 06:00 CST
    fake_now = __import__("datetime").datetime(
        2026, 10, 16, 22, 0, tzinfo=__import__("datetime").timezone.utc
    )
    monkeypatch.setattr(tu, "utc_now", lambda: fake_now)
    assert local_today() == "2026-10-17"


# ---------- 配置错误必须响亮地失败 ----------
def test_invalid_tz_fails_loudly():
    """时区名写错/缺 tzdata 时启动即失败。

    绝不静默退回 UTC —— 那正是本模块要防的坑：指标错 8 小时但没人发现。
    """
    env = dict(os.environ, KIDS_TZ="Not/AZone")
    env["PYTHONPATH"] = str(BACKEND)
    r = subprocess.run(
        [sys.executable, "-c", "import app.timeutil"],
        capture_output=True,
        text=True,
        cwd=str(BACKEND),
        env=env,
    )
    assert r.returncode != 0
    assert "KIDS_TZ" in r.stderr


def test_to_sqlite_treats_naive_as_utc():
    from datetime import datetime

    assert to_sqlite(datetime(2026, 10, 17, 6, 31, 9)) == "2026-10-17 06:31:09"
