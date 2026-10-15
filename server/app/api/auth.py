"""认证：家庭注册/登录 + 孩子档案 CRUD + 家长资料编辑（/api/v1/auth）。"""
import re

from fastapi import APIRouter, Depends, HTTPException, Header

from ..db import connect
from ..schemas import (
    ChildCreatedOut,
    ChildIn,
    LoginIn,
    LoginOut,
    MeOut,
    MePatchIn,
    RegisterIn,
    RegisterOut,
)
from ..security import create_token, hash_passcode, verify_passcode, verify_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(email: str | None) -> str | None:
    """邮箱归一化（小写/去空格）；空串视为 None；格式不合规 → 400。"""
    if email is None:
        return None
    email = email.strip().lower()
    if not email:
        return None
    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "邮箱格式不正确")
    return email


def _require_family(authorization: str = Header(default="")) -> int:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "未登录")
    payload = verify_token(authorization[7:].strip())
    if not payload:
        raise HTTPException(401, "登录已过期，请重新登录")
    return payload["fid"]


def _family_children(conn, family_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT id, name, avatar FROM children WHERE family_id=? ORDER BY id", (family_id,)
    ).fetchall()
    return [dict(r) for r in rows]


def _family_row(conn, family_id: int):
    row = conn.execute(
        "SELECT id, name, email, nickname, created_at FROM families WHERE id=?", (family_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "家庭不存在")
    return row


@router.post("/register", response_model=RegisterOut)
def register(body: RegisterIn):
    email = _normalize_email(body.email)
    conn = connect()
    try:
        exists = conn.execute(
            "SELECT id FROM families WHERE name=?", (body.family_name,)
        ).fetchone()
        if exists:
            raise HTTPException(409, "这个家庭名已被使用，换一个吧")
        if email:
            exists = conn.execute(
                "SELECT id FROM families WHERE email=?", (email,)
            ).fetchone()
            if exists:
                raise HTTPException(409, "这个邮箱已被注册，直接登录吧")
        digest, salt = hash_passcode(body.passcode)
        cur = conn.execute(
            "INSERT INTO families (name, passcode_hash, passcode_salt, email, nickname, updated_at)"
            " VALUES (?,?,?,?,?, datetime('now'))",
            (body.family_name, digest, salt, email, body.family_name),
        )
        conn.commit()
        family_id = cur.lastrowid
    finally:
        conn.close()
    return {"ok": True, "token": create_token(family_id), "family_id": family_id}


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn):
    email = _normalize_email(body.email)
    if not email and not body.family_name:
        raise HTTPException(400, "请提供邮箱或家庭名")
    conn = connect()
    try:
        if email:
            row = conn.execute(
                "SELECT * FROM families WHERE email=?", (email,)
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM families WHERE name=?", (body.family_name,)
            ).fetchone()
        if not row or not verify_passcode(body.passcode, row["passcode_hash"], row["passcode_salt"]):
            raise HTTPException(401, "邮箱/家庭名或口令不对")
        family_id = row["id"]
        return {
            "ok": True,
            "token": create_token(family_id),
            "family_id": family_id,
            "family_name": row["name"],
            "email": row["email"],
            "nickname": row["nickname"] or row["name"],
            "children": _family_children(conn, family_id),
        }
    finally:
        conn.close()


@router.get("/me", response_model=MeOut)
def me(family_id: int = Depends(_require_family)):
    conn = connect()
    try:
        row = _family_row(conn, family_id)
        return {
            "ok": True,
            "family_id": row["id"],
            "family_name": row["name"],
            "email": row["email"],
            "nickname": row["nickname"] or row["name"],
            "created_at": row["created_at"],
            "children": _family_children(conn, family_id),
        }
    finally:
        conn.close()


@router.patch("/me", response_model=MeOut)
def patch_me(body: MePatchIn, family_id: int = Depends(_require_family)):
    """家长资料编辑：改昵称 / 绑定或更换邮箱（至少一项；email 全局唯一）。"""
    if body.nickname is None and body.email is None:
        raise HTTPException(400, "至少提供 nickname 或 email 一项")
    email = _normalize_email(body.email)
    conn = connect()
    try:
        row = _family_row(conn, family_id)
        new_nickname = body.nickname if body.nickname is not None else (row["nickname"] or row["name"])
        new_email = email if email is not None else row["email"]
        if email:
            taken = conn.execute(
                "SELECT id FROM families WHERE email=? AND id<>?", (email, family_id)
            ).fetchone()
            if taken:
                raise HTTPException(409, "这个邮箱已被其他账号使用")
        conn.execute(
            "UPDATE families SET nickname=?, email=?, updated_at=datetime('now') WHERE id=?",
            (new_nickname, new_email, family_id),
        )
        conn.commit()
        return {
            "ok": True,
            "family_id": row["id"],
            "family_name": row["name"],
            "email": new_email,
            "nickname": new_nickname,
            "created_at": row["created_at"],
            "children": _family_children(conn, family_id),
        }
    finally:
        conn.close()


@router.post("/children", response_model=ChildCreatedOut)
def create_child(body: ChildIn, family_id: int = Depends(_require_family)):
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO children (family_id, name, avatar) VALUES (?,?,?)",
            (family_id, body.name, body.avatar),
        )
        conn.commit()
        return {"ok": True, "child": {"id": cur.lastrowid, "name": body.name, "avatar": body.avatar}}
    finally:
        conn.close()
