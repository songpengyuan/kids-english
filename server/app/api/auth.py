"""认证：家庭注册/登录 + 孩子档案 CRUD（/api/v1/auth）。"""
from fastapi import APIRouter, Depends, HTTPException, Header

from ..db import connect
from ..schemas import ChildIn, LoginIn, RegisterIn
from ..security import create_token, hash_passcode, verify_passcode, verify_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


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


@router.post("/register")
def register(body: RegisterIn):
    conn = connect()
    try:
        exists = conn.execute(
            "SELECT id FROM families WHERE name=?", (body.family_name,)
        ).fetchone()
        if exists:
            raise HTTPException(409, "这个家庭名已被使用，换一个吧")
        digest, salt = hash_passcode(body.passcode)
        cur = conn.execute(
            "INSERT INTO families (name, passcode_hash, passcode_salt) VALUES (?,?,?)",
            (body.family_name, digest, salt),
        )
        conn.commit()
        family_id = cur.lastrowid
    finally:
        conn.close()
    return {"ok": True, "token": create_token(family_id), "family_id": family_id}


@router.post("/login")
def login(body: LoginIn):
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM families WHERE name=?", (body.family_name,)
        ).fetchone()
        if not row or not verify_passcode(body.passcode, row["passcode_hash"], row["passcode_salt"]):
            raise HTTPException(401, "家庭名或口令不对")
        family_id = row["id"]
        return {
            "ok": True,
            "token": create_token(family_id),
            "family_id": family_id,
            "family_name": row["name"],
            "children": _family_children(conn, family_id),
        }
    finally:
        conn.close()


@router.get("/me")
def me(family_id: int = Depends(_require_family)):
    conn = connect()
    try:
        row = conn.execute("SELECT id, name FROM families WHERE id=?", (family_id,)).fetchone()
        if not row:
            raise HTTPException(404, "家庭不存在")
        return {
            "ok": True,
            "family_id": row["id"],
            "family_name": row["name"],
            "children": _family_children(conn, family_id),
        }
    finally:
        conn.close()


@router.post("/children")
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
