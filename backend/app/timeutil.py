"""时间口径的**单点定义**：事件时间戳格式、以及「学习日」的边界。

## 为什么需要这个模块

两件容易被忽略、但会让指标静默失真的事：

**1. 两个时间戳列格式不同，文本不可比较。**

- ``events.server_ts`` 由 SQLite 的 ``datetime('now')`` 写入 → UTC，格式 ``2026-10-17 06:31:09``；
- 前端上报的 ``client_ts`` 是 ``new Date().toISOString()`` → 也是 UTC，
  但格式是 ``2026-10-17T06:31:09.123Z``（带 ``T``/``Z``/毫秒）。

直接按文本比大小会得出**错误结论**：SQLite 里
``'2026-10-17T06:00:00.000Z' < '2026-10-17 23:00:00'`` 是 **false**（因为 ``'T'`` > ``' '``）。
所以任何范围比较都必须先过 ``datetime()`` 归一（见 ``rollup.py``），
写入时也统一格式（``normalize_client_ts``，由 ``api/events.py`` 调用）。

**2. 「天」是用户感知的那一天，不是 UTC 日。**

存储一律 UTC，但分桶必须按 ``KIDS_TZ``（默认 ``Asia/Shanghai``）：
CST 的 00:00–08:00 与 21:00–24:00 两段学习在 UTC 下会被推到相邻日，
而这两段恰好是孩子真实的使用高峰（上学前 / 睡前）。
北极星是「每周主动学习分钟数」，天的边界错 8 小时会直接让周汇总失真。

> 生产服务器 TZ 恰好是 ``Asia/Shanghai``，所以 ``date.today()`` 看起来"对"——
> 但那是**巧合**：库里存的是 UTC，两者只有在服务器 TZ=UTC 时才自洽。
> 这里不依赖进程时区，显式换算，换服务器也不会静默走偏。

``KIDS_TZ`` 变更属于**口径变更**：只影响之后新汇总的行，
历史 ``daily_stats`` 不会自动重算（需要按新口径回填重跑）。
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

TZ_NAME = os.environ.get("KIDS_TZ", "Asia/Shanghai")
try:
    TZ = ZoneInfo(TZ_NAME)
except (ZoneInfoNotFoundError, ValueError):
    # 时区库缺失/名字写错时**不要静默退回 UTC** —— 那正是本项目踩过的坑。
    # 宁可启动即失败，让问题在部署时暴露，而不是让指标悄悄错 8 小时。
    raise RuntimeError(f"KIDS_TZ={TZ_NAME!r} 不是可用时区（检查 tzdata 是否安装）") from None

SQLITE_FMT = "%Y-%m-%d %H:%M:%S"


def utc_now() -> datetime:
    """当前 UTC 时间（带时区）。测试里请传参覆盖，不要 mock 这个函数。"""
    return datetime.now(timezone.utc)


def to_sqlite(dt: datetime) -> str:
    """把带时区的时间转成库内统一格式（UTC、空格分隔、秒精度）。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime(SQLITE_FMT)


def normalize_client_ts(raw: object) -> str | None:
    """把客户端上报的时间串归一成库内统一格式；无法解析则返回 ``None``。

    约定：
    - 带时区（``Z`` 或 ``+08:00``）→ 按其时区换算到 UTC；
    - **不带时区 → 按 UTC 处理**。前端的 ``toISOString()`` 永远带 ``Z``；
      真遇到裸串时按 UTC 比按本地更保守——否则一个伪造/异常的客户端
      能把自己的事件挪进别的日期分桶；
    - 解析失败 → ``None``（列留空，``COALESCE`` 会退回 ``server_ts``）。

    这里**绝不因为时间戳有问题就拒收事件**：埋点是观测手段，
    不能反过来把业务请求搞挂。降级到 ``server_ts`` 的信息量足够。
    """
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    if s.endswith(("Z", "z")):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        # SQLite 能认但 fromisoformat 认不出的少见写法（如纯日期 "2026-10-17"）：
        # 交给上层；这里只保证"能认的认对"。
        try:
            d = date.fromisoformat(s)
        except ValueError:
            return None
        dt = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return to_sqlite(dt)


def local_day_bounds_utc(day: str) -> tuple[str, str]:
    """把 ``KIDS_TZ`` 下的某个日期换成 UTC 的半开区间 ``[start, end)``。

    ``local_day_bounds_utc("2026-10-17")`` → ``("2026-10-16 16:00:00", "2026-10-17 16:00:00")``。

    用半开区间而不是 ``date(x) = day``，是为了让比较经过 ``datetime()`` 归一——
    这样 ``client_ts`` / ``server_ts`` 两种格式混在一起也算得对。
    """
    d = date.fromisoformat(day)
    start = datetime(d.year, d.month, d.day, tzinfo=TZ)
    return to_sqlite(start), to_sqlite(start + timedelta(days=1))


def local_today() -> str:
    """``KIDS_TZ`` 下的今天（``YYYY-MM-DD``）。CLI 取「今天」时用这个，
    不要用 ``date.today()``（那是进程本地时区，与库内 UTC 不同源）。"""
    return utc_now().astimezone(TZ).date().isoformat()
