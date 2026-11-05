"""课程内容种子 —— 已废弃（2026-11-05 课程内容改纯前端）。

课程内容自 2026-11-05 起由前端 src/data/lessons（lessons.ts）直接提供，
不再走后端：/api/v1/content 路由已下线、lessons 表不再导入内容。
本文件保留空壳（seed_lessons 恒返回 0），避免历史调用方
（main.py 启动流程、测试 fixture）import 失败。

backend/seed/lessons.json 文件本体保留：它仍是前端 export-lessons
脚本的生成物（课程种子漂移检查用），以后若要恢复服务端内容分发，
可直接在这个通道上重新实现导入逻辑。
"""


def seed_lessons(force: bool = False) -> int:
    """历史接口：课程内容已改纯前端，不再导入；恒返回 0。

    保留 force 参数以兼容旧调用签名。
    """
    return 0
