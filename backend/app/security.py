"""安全：口令哈希（pbkdf2）+ 轻量 JWT（HMAC-SHA256，标准库实现，零额外依赖）。"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

_ITERATIONS = 120_000


def _secret() -> str:
    return os.environ.get("KIDS_JWT_SECRET", "dev-secret-change-me")


def assert_secret_configured() -> None:
    """生产启动强制校验：JWT 签名密钥缺失/默认值/过弱 → 拒绝启动（防弱签名上线）。"""
    secret = os.environ.get("KIDS_JWT_SECRET", "")
    if not secret or secret == "dev-secret-change-me" or len(secret) < 32:
        raise RuntimeError(
            "KIDS_JWT_SECRET 未配置或过弱（需 ≥32 位随机串，如 openssl rand -hex 32）——拒绝启动"
        )


def hash_passcode(passcode: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", passcode.encode(), salt.encode(), _ITERATIONS)
    return digest.hex(), salt


def verify_passcode(passcode: str, expected_hash: str, salt: str) -> bool:
    digest, _ = hash_passcode(passcode, salt)
    return hmac.compare_digest(digest, expected_hash)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(family_id: int, ttl_sec: int = 60 * 60 * 24 * 30) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"fid": family_id, "exp": int(time.time()) + ttl_sec}
    seg = _b64url(json.dumps(header, separators=(",", ":")).encode()) + "." + _b64url(
        json.dumps(payload, separators=(",", ":")).encode()
    )
    sig = hmac.new(_secret().encode(), seg.encode(), hashlib.sha256).digest()
    return seg + "." + _b64url(sig)


def verify_token(token: str) -> dict | None:
    try:
        seg, sig = token.rsplit(".", 1)
        expected = hmac.new(_secret().encode(), seg.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64url_decode(sig)):
            return None
        payload = json.loads(_b64url_decode(seg.split(".")[1]))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:  # noqa: BLE001
        return None
