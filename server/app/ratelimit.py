"""轻量内存限流（单 worker 部署适用）：IP 滑动窗口计数。

P0 用内存实现零依赖；多 worker / 规模化后换 Redis（接口不变）。
测试通过 reset() 清理计数器，避免跨用例污染。
"""
import threading
import time

_lock = threading.Lock()
_buckets: dict[str, list[float]] = {}


def hit(key: str, window_sec: float, max_hits: int) -> bool:
    """记录一次命中；窗口内超过 max_hits 返回 False（拒绝）。"""
    now = time.time()
    with _lock:
        recent = [t for t in _buckets.get(key, []) if now - t < window_sec]
        if len(recent) >= max_hits:
            _buckets[key] = recent
            return False
        recent.append(now)
        _buckets[key] = recent
        return True


def reset() -> None:
    """清空全部计数（测试隔离用）。"""
    with _lock:
        _buckets.clear()
