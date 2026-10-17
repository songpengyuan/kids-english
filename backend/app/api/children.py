"""孩子资源（/api/v1/children）：当前家庭的子档案集合 CRUD。

REST 规范：
  GET   /children             → 200 孩子列表
  POST  /children             → 201 创建孩子
  PATCH /children/{child_id}  → 200 编辑孩子档案
孩子是顶层资源；其进度/奖励/录音等子资源挂载于
/children/{child_id}/progress|rewards|recordings（见各自模块）。
"""
from fastapi import APIRouter, Depends, HTTPException, status

from ..db import connect
from ..schemas import ChildCreatedOut, ChildIn, ChildPatchIn, ChildrenOut
from .auth import _family_children, _require_family  # 孩子列表实现只用一份（含口令家族补默认孩子）

router = APIRouter(prefix="/api/v1/children", tags=["children"])


@router.get("", response_model=ChildrenOut)
def list_children(family_id: int = Depends(_require_family)):
    """当前家庭的孩子列表。"""
    conn = connect()
    try:
        return {"ok": True, "children": _family_children(conn, family_id)}
    finally:
        conn.close()


@router.post("", response_model=ChildCreatedOut, status_code=status.HTTP_201_CREATED)
def create_child(body: ChildIn, family_id: int = Depends(_require_family)):
    """创建孩子（201 Created）。"""
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO children (family_id, name, avatar, birth_date) VALUES (?,?,?,?)",
            (family_id, body.name, body.avatar, body.birth_date),
        )
        conn.commit()
        return {
            "ok": True,
            "child": {"id": cur.lastrowid, "name": body.name, "avatar": body.avatar, "birth_date": body.birth_date},
        }
    finally:
        conn.close()


@router.patch("/{child_id}", response_model=ChildCreatedOut)
def patch_child(
    child_id: int, body: ChildPatchIn, family_id: int = Depends(_require_family)
):
    """编辑孩子档案：改名字/头像/出生日期（至少一项；缺席=不改，显式 null=清空）。"""
    if not body.model_fields_set:
        raise HTTPException(400, "至少提供 name/avatar/birth_date 一项")
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id, name, avatar, birth_date FROM children WHERE id=? AND family_id=?",
            (child_id, family_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "孩子不存在")
        fields = set(body.model_fields_set)
        name = body.name if "name" in fields else row["name"]
        avatar = body.avatar if "avatar" in fields else row["avatar"]
        birth_date = body.birth_date if "birth_date" in fields else row["birth_date"]
        conn.execute(
            "UPDATE children SET name=?, avatar=?, birth_date=? WHERE id=?",
            (name, avatar, birth_date, child_id),
        )
        conn.commit()
        return {
            "ok": True,
            "child": {"id": child_id, "name": name, "avatar": avatar, "birth_date": birth_date},
        }
    finally:
        conn.close()
