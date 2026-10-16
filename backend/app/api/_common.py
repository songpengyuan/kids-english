"""API 层的共享小工具（避免在每个路由模块里各写一份）。"""


def child_belongs(conn, child_id: int, family_id: int) -> bool:
    """孩子是否属于该家庭 —— 跨家庭一律当作「不存在」（不泄露存在性）。"""
    return bool(
        conn.execute(
            "SELECT id FROM children WHERE id=? AND family_id=?", (child_id, family_id)
        ).fetchone()
    )
