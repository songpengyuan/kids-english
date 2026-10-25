"""kids-english 后端 API 入口（FastAPI）。

启动时自动建表并导入课程种子（server/seed/lessons.json，幂等）。
环境变量（server/.env，不入库）：
  XF_APPID / XF_API_KEY / XF_API_SECRET  讯飞评测凭据
  KIDS_JWT_SECRET                        JWT 签名密钥（生产必填，缺失/默认值拒绝启动）
"""
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

load_dotenv(Path(__file__).resolve().parent / ".env")

from app.api import auth, children, content, evaluation, events, progress, recordings, rewards  # noqa: E402
from app.db import connect, init_db, schema_version  # noqa: E402
from app.ratelimit import hit  # noqa: E402
from app.schemas import PongOut  # noqa: E402
from app.security import assert_secret_configured  # noqa: E402
from app.seed import seed_lessons  # noqa: E402

logger = logging.getLogger("kids-api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 安全闸门：密钥缺失/默认值/过弱 → 拒绝启动（防弱签名 JWT 上线）
    assert_secret_configured()
    init_db()
    auth.seed_gate_code()  # 门禁口令种子（表空 + env 配置时自动写第一条）
    n = seed_lessons()
    if n:
        print(f"[seed] 课程内容已导入/更新 {n} 课")
    yield


app = FastAPI(title="kids-english api", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def access_log(request, call_next):
    """请求日志：method path -> status 耗时（systemd journal 可见）。"""
    start = time.perf_counter()
    resp = await call_next(request)
    dur_ms = (time.perf_counter() - start) * 1000
    logger.info("%s %s -> %s %.1fms", request.method, request.url.path, resp.status_code, dur_ms)
    return resp


@app.middleware("http")
async def rate_limit(request, call_next):
    """轻量内存限流：登录/注册 10 次/分/IP（防暴力试口令）；其余 300 次/分/IP。"""
    ip = request.client.host if request.client else "unknown"
    if request.url.path in (
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/gate",
    ):
        key, window, limit = f"login:{ip}", 60.0, 10
    elif request.url.path == "/api/v1/events":
        # 事件是批量写入接口，防「写入放大器」（ADR-004）
        key, window, limit = f"events:{ip}", 60.0, 60
    else:
        key, window, limit = f"api:{ip}", 60.0, 300
    if not hit(key, window, limit):
        return JSONResponse(
            status_code=429,
            content={"ok": False, "error": "too_many_requests", "msg": "请求太频繁，请稍后再试"},
        )
    return await call_next(request)


app.include_router(auth.router)
app.include_router(children.router)
app.include_router(content.router)
app.include_router(progress.router)
app.include_router(rewards.router)
app.include_router(evaluation.router)
app.include_router(recordings.router)
app.include_router(events.router)


@app.get("/api/ping", response_model=PongOut)
def ping():
    # schema_version 是附加信息：DB 偶发不可读时不拖垮存活探测本身
    try:
        conn = connect()
        try:
            ver = schema_version(conn)
        finally:
            conn.close()
    except Exception:
        ver = None
    return {"ok": True, "msg": "kids-english backend ready", "schema_version": ver}


# 旧前端路径 /api/evaluate 已下线（2026-10-25 接口评审）：
# 新前端从未调用过它（前端只有 /api/v1/evaluation 的生成类型，无调用方），
# 双路径只多一份上传面。回滚锚点：git log -S "legacy_evaluate"。
