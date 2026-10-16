"""pytest 全局配置：**在任何测试模块 import `main` 之前**统一设置测试环境。

为什么必须放在 conftest 而不是各测试文件顶部：
    ``app/api/recordings.py`` 的 ``MEDIA_ROOT`` 在模块被 import 时即固化，
    而**首个** import 它的测试文件决定了这个值。若那个文件没设 ``KIDS_MEDIA_ROOT``，
    MEDIA_ROOT 就指向真实的 ``backend/media``，后续文件再设也来不及 ——
    表现是「同一个用例单跑通过、合跑失败」，且有污染真实媒体目录的风险。

pytest 保证 conftest.py 在收集测试之前加载，所以这里设置最可靠。
统一用 ``if ... not in os.environ``：允许外部显式覆盖（如 ci-local.sh 传入 KIDS_JWT_SECRET）。
"""
import os
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="kids-tests-")

if "KIDS_DB_PATH" not in os.environ:
    os.environ["KIDS_DB_PATH"] = str(Path(_TMP) / "test.db")
if "KIDS_JWT_SECRET" not in os.environ:
    os.environ["KIDS_JWT_SECRET"] = "test-secret-" + "k" * 32
if "KIDS_MEDIA_ROOT" not in os.environ:
    os.environ["KIDS_MEDIA_ROOT"] = str(Path(_TMP) / "media")
# 媒体根必须存在：测试 fixture 会遍历它做清理，目录缺失会直接 FileNotFoundError
Path(os.environ["KIDS_MEDIA_ROOT"]).mkdir(parents=True, exist_ok=True)
