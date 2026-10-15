"""奖励数据：贝壳/形态星级/开箱次数按孩子云存取（/api/v1/rewards）。

多设备并发（v0.2）：上报合并写——贝壳/开箱数取 max、形态星级逐形态取 max，
双设备开箱/兑换互不覆盖（数据只增不减）。
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


def _merge_rewards(existing: dict, incoming: dict) -> dict:
    """合并写：贝壳/开箱数取 max，形态星级逐形态取 max，双端都不丢。"""
    ef = existing.get("forms") or {}
    nf = incoming.get("forms") or {}
    forms = {k: max(ef.get(k, 0) or 0, v or 0) for k, v in nf.items()}
    for k, v in ef.items():
        if k not in forms:
            forms[k] = v
    return {
        "shells": max(existing.get("shells", 0) or 0, incoming.get("shells", 0) or 0),
        "forms": forms,
        "chestsOpened": max(existing.get("chestsOpened", 0) or 0, incoming.get("chestsOpened", 0) or 0),
    }


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
        row = conn.execute(
            "SELECT data_json FROM rewards WHERE child_id=?", (child_id,)
        ).fetchone()
        existing = json.loads(row["data_json"]) if row else {}
        merged = _merge_rewards(existing, body.model_dump())
        conn.execute(
            """INSERT INTO rewards (child_id, data_json, updated_at)
               VALUES (?,?,datetime('now'))
               ON CONFLICT(child_id) DO UPDATE SET
                 data_json=excluded.data_json, updated_at=datetime('now')""",
            (child_id, json.dumps(merged, ensure_ascii=False)),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

