"""认证：家庭注册/登录 + 孩子档案 CRUD + 家长资料编辑（/api/v1/auth）。"""
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Header

from ..db import connect
from ..schemas import (
    ChildCreatedOut,
    ChildIn,
    ChildPatchIn,
    GateIn,
    GateOut,
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
        "SELECT id, name, avatar, birth_date FROM children WHERE family_id=? ORDER BY id", (family_id,)
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


# 门禁默认家庭名（首次种子口令对应的家庭）
_GATE_FAMILY_NAME = "gate-default"


def seed_gate_code() -> None:
    """启动时种子：若 gate_codes 表为空且环境变量 KIDS_GATE_PASSCODE 已配置，
    自动创建默认家庭 + 写入第一条门禁口令。以后新增口令直接插表即可。"""
    passcode = os.environ.get("KIDS_GATE_PASSCODE", "")
    if not passcode:
        return
    conn = connect()
    try:
        count = conn.execute("SELECT COUNT(*) AS n FROM gate_codes").fetchone()["n"]
        if count > 0:
            return  # 已有口令，不重复种子
        # 确保默认家庭存在
        row = conn.execute(
            "SELECT id FROM families WHERE name=?", (_GATE_FAMILY_NAME,)
        ).fetchone()
        if row:
            family_id = row["id"]
        else:
            digest, salt = hash_passcode(passcode)
            cur = conn.execute(
                "INSERT INTO families (name, passcode_hash, passcode_salt, nickname, updated_at)"
                " VALUES (?,?,?,?, datetime('now'))",
                (_GATE_FAMILY_NAME, digest, salt, "家长"),
            )
            family_id = cur.lastrowid
        # 写入门禁口令
        g_digest, g_salt = hash_passcode(passcode)
        conn.execute(
            "INSERT INTO gate_codes (code_hash, code_salt, family_id, label) VALUES (?,?,?,?)",
            (g_digest, g_salt, family_id, "默认口令"),
        )
        conn.commit()
    finally:
        conn.close()


@router.post("/gate", response_model=GateOut)
def gate_verify(body: GateIn):
    """应用入口门禁：口令即登录凭证（多口令，每个口令对应一个家庭）。

    - 查 gate_codes 表，逐条比对 passcode；
    - 匹配 → 签发该口令对应家庭的 JWT；
    - 不匹配 → 401。
    """
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT code_hash, code_salt, family_id FROM gate_codes"
        ).fetchall()
        if not rows:
            raise HTTPException(503, "门禁未配置")

        matched_family_id = None
        for r in rows:
            if verify_passcode(body.passcode, r["code_hash"], r["code_salt"]):
                matched_family_id = r["family_id"]
                break

        if matched_family_id is None:
            raise HTTPException(401, "口令不对")

        row = conn.execute(
            "SELECT id, name, email, nickname FROM families WHERE id=?",
            (matched_family_id,),
        ).fetchone()
        if not row:
            raise HTTPException(500, "口令对应家庭不存在")

        return {
            "ok": True,
            "token": create_token(matched_family_id),
            "family_id": matched_family_id,
            "family_name": row["name"],
            "email": row["email"],
            "nickname": row["nickname"] or row["name"],
            "children": _family_children(conn, matched_family_id),
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


@router.patch("/children/{child_id}", response_model=ChildCreatedOut)
def patch_child(
    child_id: int, body: ChildPatchIn, family_id: int = Depends(_require_family)
):
    """孩子档案编辑：改名字/头像/出生日期（至少一项；缺席=不改，显式 null=清空）。"""
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
