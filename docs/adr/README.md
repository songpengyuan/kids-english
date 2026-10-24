# 架构决策记录（ADR）

> 目录约定：`docs/adr/ADR-NNN-<短横线标题>.md`。编号只增不改；决策被推翻时**不删旧文件**，
> 把旧文件 Status 改为 `Superseded by ADR-NNN`，再写一条新的。

## 为什么要有这个目录

`DEVELOPMENT.md` 记录"**做了什么**"，`ARCHITECTURE-REVIEW.md` 记录"**现状哪里不好**"，
本目录记录"**为什么选它、放弃了什么**"。

三者不可互替。最贵的知识不是代码长什么样（读代码就知道），而是：
- 当时有哪些备选方案；
- 为什么排除了它们；
- 这个选择在什么条件下会失效。

没有 ADR 的项目，六个月后会把一个**当时有意的取舍**当成"历史遗留的坑"顺手改掉，
然后踩回同一个坑。本仓库已有一次现成教训：heroDetails 的第二份手写数据（见 DEVELOPMENT.md §14.7）。

## 索引

| 编号 | 标题 | 状态 | 决策域 | 落地时机 |
|---|---|---|---|---|
| [ADR-001](./ADR-001-content-single-source.md) | 课程内容的单一事实源与防漂移闸门 | Accepted（2026-10-17 落地，CI 闸门已验证） | 内容/交付 | 现在（约 30 分钟） |
| [ADR-002](./ADR-002-versioned-db-migrations.md) | 数据库迁移版本化 | Accepted（2026-10-17 落地，schema_version=3） | 数据/交付 | 下一次改表之前 |
| [ADR-003](./ADR-003-backend-deploy-pipeline.md) | 后端纳入 CI 部署流水线 | Accepted（2026-10-17 落地，deploy.yml 双线部署） | 交付/运维 | P1 内 |
| [ADR-004](./ADR-004-events-and-observability.md) | 埋点事件表与前端错误上报 | Accepted（2026-10-17 落地；课时级埋点已接，覆盖面持续补） | 数据/可观测 | P1 内 |
| [ADR-005](./ADR-005-media-lifecycle-and-child-privacy.md) | 录音资产生命周期与儿童隐私边界 | Accepted（2026-10-17 落地；2026-10-24 补录音出仓处置） | 数据/合规 | 第 1 条真实录音入库前 |
| [ADR-006](./ADR-006-listen-player-page-visibility.md) | 磨耳朵播放页「浮层让位」而非「藏掉底栏」 | Accepted（2026-10-17 落地） | 前端/导航 | 已完成 |
| [ADR-007](./ADR-007-capability-fields-flat-with-gates.md) | 课时能力字段：扁平可缺省 + 校验闸门 | Accepted（2026-10-24 落地） | 内容/契约 | 已完成 |

状态取值：`Proposed`（提案，待拍板）/ `Accepted`（已拍板）/ `Deprecated` / `Superseded by ADR-NNN`。

上层文档：[ARCHITECTURE-EVOLUTION.md](../ARCHITECTURE-EVOLUTION.md)（总体架构与长期演进）。

## 模板

```markdown
# ADR-NNN: 标题

## Status
Proposed | Accepted | Deprecated | Superseded by ADR-NNN

## Context
看到了什么问题？（事实与约束，不含解法）

## Decision
决定做什么？

## Consequences
什么变容易了、什么变难了、留下什么新债？

## Alternatives considered
被排除的备选方案，以及排除它们的理由。
```

## 什么时候需要写一条 ADR

满足任一条就写：

1. 该决策**难以回退**（数据模型、存储选型、契约格式、公开 API 形状）；
2. 该决策**反直觉**，后来者极可能"顺手修正"回去；
3. 存在**至少两个都说得通的方案**，选择依赖当时的约束（规模/时间/人力）；
4. 该决策**定义了边界**（谁负责什么、什么不归这里管）。

不需要写 ADR 的：命名、目录微调、样式取值、能靠一次提交描述说清的事——
那属于 commit message 的职责，写 ADR 会让这个目录迅速贬值为流水账。

## 维护约定

- 决策落地后，把对应 ADR 的 Status 改成 `Accepted`，并在 `Consequences` 末尾补一行实测结果。
- 决策失效时，**先**改 Status 指向新 ADR，**再**动代码。顺序反了，追查线索就断了。
