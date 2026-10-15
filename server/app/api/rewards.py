"""奖励数据：贝壳/形态星级/开箱次数按孩子云存取（/api/v1/rewards）。

换设备不丢：前端每次开箱/兑换后全量上报（覆盖写），登录后拉取合并。
"""
import json

from fastapi import APIRouter, Depends, HTTPException

from ..db import connect
from ..schemas import RewardsIn, RewardsOut, RewardsPutOut
from .auth import _require_family

router = APIRouter(prefix="/api/v1/rewards", tags=["rewards"])


def _child_belongs(conn, child_id: int, family_id: int) -> bool:
    return bool(
        conn.execute(
            "SELECT id FROM children WHERE id=? AND family_id=?", (child_id, family_id)
        ).fetchone()
    )


@router.get("/{child_id}", response_model=RewardsOut)
def get_rewards(child_id: int, family_id: int = Depends(_require_family)):
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        row = conn.execute(
            "SELECT data_json, updated_at FROM rewards WHERE child_id=?", (child_id,)
        ).fetchone()
        if not row:
            return {"ok": True, "data": {"shells": 0, "forms": {}, "chestsOpened": 0}, "updated_at": None}
        data = json.loads(row["data_json"])
        return {"ok": True, "data": data, "updated_at": row["updated_at"]}
    finally:
        conn.close()


@router.put("/{child_id}", response_model=RewardsPutOut)
def put_rewards(
    child_id: int, body: RewardsIn, family_id: int = Depends(_require_family)
):
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        conn.execute(
            """INSERT INTO rewards (child_id, data_json, updated_at)
               VALUES (?,?,datetime('now'))
               ON CONFLICT(child_id) DO UPDATE SET
                 data_json=excluded.data_json, updated_at=datetime('now')""",
            (child_id, json.dumps(body.model_dump(), ensure_ascii=False)),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
