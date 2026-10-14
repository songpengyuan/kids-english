"""kids-english 后端 API 入口（FastAPI）。

启动时自动建表并导入课程种子（server/seed/lessons.json，幂等）。
环境变量（server/.env，不入库）：
  XF_APPID / XF_API_KEY / XF_API_SECRET  讯飞评测凭据
  KIDS_JWT_SECRET                        JWT 签名密钥（生产必填）
"""
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile

load_dotenv(Path(__file__).resolve().parent / ".env")

from app.api import auth, content, evaluation, progress  # noqa: E402
from app.db import init_db  # noqa: E402
from app.seed import seed_lessons  # noqa: E402

app = FastAPI(title="kids-english api", version="0.1.0")

app.include_router(auth.router)
app.include_router(content.router)
app.include_router(progress.router)
app.include_router(evaluation.router)


@app.on_event("startup")
def startup() -> None:
    init_db()
    n = seed_lessons()
    if n:
        print(f"[seed] 课程内容已导入/更新 {n} 课")


@app.get("/api/ping")
def ping():
    return {"ok": True, "msg": "kids-english backend ready"}


# 兼容旧前端路径：评测端点保留 /api/evaluate（新前端迁移到 /api/v1/evaluation）
@app.post("/api/evaluate")
async def legacy_evaluate(file: UploadFile = File(...), text: str = Form(...)):
    return await evaluation.api_evaluate(file, text)
