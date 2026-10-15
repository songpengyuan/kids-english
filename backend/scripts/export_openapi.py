"""导出 FastAPI OpenAPI 契约 → backend/openapi.json（单一契约源）。

前端类型由 openapi-typescript 从该文件生成（src/types/api.ts）；
CI 校验：export 后 git diff --exit-code backend/openapi.json，漂移即失败。

运行（cwd=server）：.venv/bin/python scripts/export_openapi.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app  # noqa: E402

spec = app.openapi()
out = Path(__file__).resolve().parent.parent / "openapi.json"
out.write_text(json.dumps(spec, ensure_ascii=False, indent=2))
print(f"[openapi] 已导出 {len(spec.get('paths', {}))} 条路径 → backend/openapi.json")
