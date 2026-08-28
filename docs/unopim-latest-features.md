# UnoPim 3.0 最新版本、功能与采用建议

> 核对日期：2026-08-27  
> 来源范围：仅使用 UnoPim 官方 GitHub 仓库的 README、Branches/Tags/Releases、SECURITY、源码配置，以及官方 3.0 用户指南与开发文档。  
> 结论中的“官方未记录”表示在上述官方资料中没有找到对应能力承诺，不等同于证明代码绝对不存在。

## 结论

截至 2026-08-27，UnoPim 最新稳定版是 **v3.0.0**，发布于 2026-07-31；官方 Release 页面仍将它标为 Latest，3.0 用户指南也明确写明 Current Version 为 v3.0.0。[GitHub Releases](https://github.com/unopim/unopim/releases)、[3.0 用户指南简介](https://docs.unopim.com/3.0/introduction/)

**新项目可以直接以 v3.0.0 为基线做 PoC/MVP，但不建议把 `master`、移动中的 `3.0` 分支或 Docker 的 `latest` 镜像直接作为生产版本。**正确做法是固定 `v3.0.0` tag/对应镜像摘要，在测试环境验证 1688 商品导入、变体、媒体、搜索和队列，再上线小流量试点。

原因有三点：

1. v3.0.0 是一个刚发布不到一个月的重大版本，Laravel、PHP、API 集成、变体存储、Webhook 和数据库结构都发生了大改。[v3.0.0 Release](https://github.com/unopim/unopim/releases/tag/v3.0.0)、[3.0 升级指南](https://devdocs.unopim.com/3.0/prologue/upgrade-guide.html)
2. 截至核对日，3.0 尚没有公开的 `v3.0.1` patch Release；官方安全策略中 3.0 的 bug-fix/security-fix 截止日期仍是 `TBD`。[SECURITY.md](https://github.com/unopim/unopim/blob/3.0/SECURITY.md)
3. 官方快速启动的 `compose.yaml` 默认使用 `${UNOPIM_TAG:-latest}`，README/文档又让用户从 `master` 下载 Compose；这适合体验，不适合可重复的生产部署。[3.0 compose.yaml](https://github.com/unopim/unopim/blob/3.0/compose.yaml)、[Docker 安装文档](https://devdocs.unopim.com/3.0/introduction/installation-docker.html)

## 版本线与分支关系

### 稳定版本

| 项目 | 截至 2026-08-27 的状态 | 使用建议 |
|---|---|---|
| `v3.0.0` tag | 最新稳定 Release，commit `d5dbe7b`，2026-07-31 发布 | **生产/PoC 应固定此 tag 或对应不可变镜像摘要** |
| `3.0` branch | 当前仓库默认分支，也是 3.0.x 维护线；tag 之后仍有提交 | 用于跟踪 3.0 修复，不要让生产环境自动拉取分支头 |
| `master` branch | 前向开发/集成线；官方安全流程写明先在 `master` 修复，再回移到受支持版本线 | 只用于观察未来开发，不作为生产依赖 |
| `2.1` branch | 上一稳定线；3.0 文档将其称为 previous stable | 已有 2.1 项目按升级指南迁移；新项目不建议从 2.1 起步 |

依据：

- [UnoPim Releases](https://github.com/unopim/unopim/releases) 将 v3.0.0 标为 Latest。
- [官方 Tags 页面](https://github.com/unopim/unopim/tags) 可用于核对不可变发布标签。
- 当前[官方仓库首页](https://github.com/unopim/unopim)展示的默认代码线是 `3.0`。
- [官方安全策略](https://github.com/unopim/unopim/blob/3.0/SECURITY.md)说明安全修复先在 `master` 开发，再 backport 到各受支持版本；因此 `master` 不是“最新稳定版”的同义词。

### 应如何安装

生产建议优先从 tag 构建：

```bash
git clone https://github.com/unopim/unopim.git
cd unopim
git checkout v3.0.0
```

官方升级指南也明确使用 `git checkout v3.0.0` 获取 3.0 稳定代码。[升级指南](https://devdocs.unopim.com/3.0/prologue/upgrade-guide.html)

不要在生产中直接执行以下默认行为而不固定版本：

```bash
curl -O https://raw.githubusercontent.com/unopim/unopim/master/compose.yaml
docker compose up -d
```

官方 Compose 默认将应用和队列镜像解析为 `webkul/unopim:${UNOPIM_TAG:-latest}` 和 `webkul/unopim-queue:${UNOPIM_TAG:-latest}`；若镜像仓库提供版本标签，应显式设置 `UNOPIM_TAG`，更稳妥的是固定镜像 digest。[compose.yaml](https://github.com/unopim/unopim/blob/3.0/compose.yaml)

## UnoPim 3.0 运行环境

### 必需与推荐依赖

| 组件 | 3.0 官方要求/建议 | 备注 |
|---|---|---|
| PHP | **8.4.1+** | 安全策略写 tested PHP 8.4；Laravel 13 |
| Laravel | **13.x** | 3.0 的核心框架 |
| Web Server | Nginx 或 Apache 2 | 官方 Docker 默认 Nginx+PHP-FPM，另有 Apache 覆盖文件 |
| Composer | README 为 2.5+；升级清单为 **2.6+** | 采用更严格的 2.6+ |
| Node.js | **20 LTS+** | 用于构建前端资源，不是最终 Web 请求运行时 |
| 数据库 | MySQL 8.0.32+ 或 PostgreSQL 16 推荐 | PostgreSQL 16 与 MySQL 8 均在 CI 范围；新 Docker 默认 PostgreSQL 16 |
| MariaDB | 10.6+ 被文档列为支持 | 官方明确说明不在 CI 矩阵，生产不优先 |
| Redis | 7.x+ 推荐 | 缓存、队列，可用于 Session；数据库队列是低负载后备，`sync` 仅开发使用 |
| Elasticsearch | 文档写 8.19+；随附 Compose 固定 8.17.0 | 官方资料存在版本不一致，见“已知限制” |
| Docker | 20.10+，Docker Compose v2+ | 官方称 Docker 为最容易的完整环境 |

来源：[官方 Requirements](https://devdocs.unopim.com/3.0/introduction/requirements.html)、[官方 README](https://github.com/unopim/unopim#installation)、[Docker 安装](https://devdocs.unopim.com/3.0/introduction/installation-docker.html)、[SECURITY.md](https://github.com/unopim/unopim/blob/3.0/SECURITY.md)

### PHP 扩展和资源

`composer.json` 的硬要求包括 `calendar`、`curl`、`intl`、`mbstring`、`openssl`、`pdo`、`pdo_mysql`、`tokenizer`；升级预检还检查 `json`、`xml`、`gd`、`zip`、`fileinfo`。即使只使用 PostgreSQL，当前仍要安装 `pdo_mysql`，并额外安装 `pdo_pgsql`。[Requirements](https://devdocs.unopim.com/3.0/introduction/requirements.html)、[官方 README 安装段](https://github.com/unopim/unopim#installation)

官方 Ubuntu 指南给出的基线为：

- 最低 2 GB RAM，建议 4 GB；至少 10 GB 磁盘。
- Web PHP `memory_limit=512M`；大目录导入、导出和重建索引时 CLI 建议 2 GB 或更高。
- Elasticsearch 小目录建议 1–2 GB heap，并保持至少 15% 可用磁盘。[Ubuntu 24.04 安装](https://devdocs.unopim.com/3.0/introduction/installation-ubuntu.html)、[Requirements](https://devdocs.unopim.com/3.0/introduction/requirements.html)

实际承载外部客户 SaaS 时，4 GB 只能作为开发/小型 PoC 起点；应用、队列、数据库、Redis、Elasticsearch 和对象媒体不应全部按最低规格估算生产容量。

### 队列和调度器是必需生产组件

以下任务依赖后台 worker：导入导出、AI Agent、完整度计算、Webhook、Publication 和 Digital Product Passport 发布。官方建议 worker 至少监听：

```bash
php artisan queue:work redis \
  --queue=system,completeness,publication,webhooks,default
```

还需要每分钟运行 Laravel Scheduler。漏掉 `webhooks` 会导致 Webhook 一直堆积，漏掉 `publication` 会导致 Passport 一直等待。[README 队列说明](https://github.com/unopim/unopim#installation)、[Queue & Scheduler](https://devdocs.unopim.com/3.0/introduction/queue-scheduler-setup.html)

## 3.0 开源核心版完整功能

UnoPim 主仓库使用 [MIT License](https://github.com/unopim/unopim/blob/3.0/LICENSE)。以下是官方 3.0 用户指南和主仓库 README 明确列出的核心能力。

### 1. 商品建模与维护

- 集中商品管理；支持 **Simple** 和 **Configurable** 两类商品。
- 属性、属性选项、属性组、属性族；文档列出 12 种数据类型与视觉化 swatch 选项。
- 分类树与可配置 Category Fields。
- 多语言、Locale、多币种、Channel 作用域。
- 两级变体结构：父商品 → 变体组 → 最终 SKU，支持父级共享值继承。
- 变体轴可配置，适合颜色、尺寸等组合。
- 自定义商品关联类型，可定义配件、替代品、套装等，并可给关联增加字段。
- Measurement Families、单位和自动换算。
- 商品复制、历史变更、前后值对照。

来源：[3.0 Introduction](https://docs.unopim.com/3.0/introduction/)、[Product Types](https://docs.unopim.com/3.0/products/)、[Product Variants](https://docs.unopim.com/3.0/products/variants.html)、[Associations](https://docs.unopim.com/3.0/associations/)、[Measurements](https://docs.unopim.com/3.0/measurements/)、[Simple Product](https://docs.unopim.com/3.0/products/simple.html)

### 2. 商品数据质量与日常效率

- 按 Channel 和 Locale 计算 Product Completeness。
- Product Grid 支持按分类、完整度、日期、商品属性和属性值筛选。
- 保存并复用筛选器与列布局；大批量操作可在后台运行。
- 批量编辑商品。
- Dashboard 展示商品统计、活动、完整度、渠道准备度和近期任务。
- 站内及邮件通知。
- SPA 风格无整页刷新导航、全局 Save/Discard bar、深色模式、分类树懒加载、Quick Create。

来源：[What's New in 3.0](https://docs.unopim.com/3.0/releases/)、[Admin Essentials](https://docs.unopim.com/3.0/introduction/admin-essentials.html)、[3.0 Introduction](https://docs.unopim.com/3.0/introduction/)

### 3. 用户、权限和登录

- 用户与 Role-based Access Control。
- 用户分别设置 UI Locale、Catalog Locale、默认 Channel 和时区。
- Microsoft Entra ID / Microsoft 工作账号 SSO。
- API Integration 使用独立的 robot user，并按授予的权限运行，不能登录后台。
- 忘记密码、Remember Me、头像/Gravatar 控制。

来源：[Users](https://docs.unopim.com/3.0/settings/users.html)、[Integration](https://docs.unopim.com/3.0/configuration/integration.html)、[What's New](https://docs.unopim.com/3.0/releases/)

### 4. API、Webhook 和数据流转

- REST API，并使用 OAuth 2.0/Integration 凭证。
- 3.0 API 扩展到商品、商品结构、属性、属性族、Locale、Channel、Currency、媒体、Passport 发布及 delta sync。
- 多 Webhook：每个 URL 可选择事件、设置签名 secret、自定义 header、测试连接并查看请求/响应日志。
- 导入/导出 CSV、XLS、XLSX；含媒体时支持 ZIP 流程。
- 可导入导出商品、分类、关联、属性/选项/组/族、Category Fields、Association Types、Locale、Channel、Currency、Role、User。
- 商品导出支持 Channel、Locale、Currency、属性、属性族、状态、完整度、日期、分类、SKU 和属性条件；`since last export` 可做增量导出。
- Publication Channels 将商品 payload 通过队列发送到下游并记录投递。

来源：[What's New](https://docs.unopim.com/3.0/releases/)、[Export](https://docs.unopim.com/3.0/data-transfer/export.html)、[Webhooks](https://docs.unopim.com/3.0/configuration/webhooks.html)、[主仓库 README](https://github.com/unopim/unopim)

### 5. AI 能力

- Magic AI 文本生成、图片生成、翻译和自动补全。
- 支持 OpenAI、Anthropic、Gemini、Groq、Ollama、xAI、Mistral、DeepSeek、Azure 和 OpenAI-compatible Custom endpoint。
- AI Agent Chat 提供 30+ PIM 工具，可搜索、创建、更新、批量编辑、分类、导出和做数据质量操作。
- 平台密钥加密存储、连接测试、可为文本/图片/翻译/Agent 分配不同模型。

这些是开源代码中的集成能力，但云端模型的 API key、额度和费用不是 UnoPim 自带；未配置至少一个可用平台时，Magic AI 和 Agent 功能保持关闭。[Magic AI Platforms](https://docs.unopim.com/3.0/magic-ai/platforms.html)、[Magic AI Settings](https://docs.unopim.com/3.0/magic-ai/settings.html)、[3.0 Introduction](https://docs.unopim.com/3.0/introduction/)

### 6. Digital Product Passport 与公开发布

- 可配置 Product Passport 模板；包含 EU Battery Regulation 与 ESPR 预置方向。
- 绑定商品族、按语言发布、二维码访问、版本历史、撤回/恢复。
- Consumer / Operator / Authority 不同访问层级；后两者通过有过期时间的签名链接。
- 支持 GTIN 校验、批量发布、重发、查看次数及 GDPR redaction。

来源：[What's New](https://docs.unopim.com/3.0/releases/)、[Publishing a Passport](https://docs.unopim.com/3.0/passport/publishing.html)

### 7. 可选开源包，不应误算为核心自带

安装器把 `dam`、`shopify`、`bagisto`列为 optional packages。[Installation](https://devdocs.unopim.com/3.0/introduction/installation.html)

对商品云库最重要的是 DAM：它是单独的 MIT 仓库/Composer 包 `unopim/dam`，v3.0.0 对应 Laravel 13 / PHP 8.4，提供文件夹、资产预览、Tag、元数据、评论、资源关联、历史、批量操作和 S3 迁移。视频/PDF缩略图还需要 FFmpeg 和 Poppler；没有这两个二进制时仍可使用，但退化为通用文件图标。[UnoPim DAM 官方仓库](https://github.com/unopim/unopim-digital-asset-management)、[DAM v3.0.0 Release](https://github.com/unopim/unopim-digital-asset-management/releases/tag/v3.0.0)

因此：核心 PIM 有商品 Image/Gallery/Media 能力，但要做真正的“客户素材库、文件夹、元数据与资产协作”，应将 DAM 3.0 作为独立依赖纳入测试和版本锁定。

## 已知限制与采用风险

### 1. 3.0 是刚落地的大版本

官方升级指南明确把 v3.0.0 标为 breaking release：

- PHP 从 8.3 升到 8.4.1，Laravel 升到 13。
- 替换/重构 API integrations、Webhooks、variant storage。
- 包含大量 schema 和数据迁移。
- 原有 API client 升级后必须重新认证。
- 部分后台 URL 改变。
- 自定义包需要适配多个依赖大版本。

来源：[3.0 Upgrade Guide](https://devdocs.unopim.com/3.0/prologue/upgrade-guide.html)、[What's New — Before you upgrade](https://docs.unopim.com/3.0/releases/)

这对全新项目没有“旧数据迁移”负担，但说明 3.0 的接口和插件生态仍处在新基线磨合期。

### 2. 支持窗口尚未给出明确截止日期

官方 SECURITY.md 把 3.0.0 标为 Current，但 Bug Fixes Until 和 Security Fixes Until 均为 `TBD`。这意味着项目仍在支持，并不代表已经承诺一个明确 LTS 窗口。[SECURITY.md](https://github.com/unopim/unopim/blob/3.0/SECURITY.md)

### 3. 官方资料内部存在少量依赖版本不一致

- Requirements 写 Elasticsearch 8.19+；3.0 `compose.yaml` 固定 Elasticsearch 8.17.0，PHP client 约束也从 8.17 起。
- README 写 Composer 2.5+；升级清单写 Composer 2.6+。

来源：[Requirements](https://devdocs.unopim.com/3.0/introduction/requirements.html)、[compose.yaml](https://github.com/unopim/unopim/blob/3.0/compose.yaml)、[Upgrade Guide](https://devdocs.unopim.com/3.0/prologue/upgrade-guide.html)、[README](https://github.com/unopim/unopim#installation)

建议 PoC 先使用官方 v3.0.0 对应 Compose 的整套组合，人工安装时采用要求的严格上界（Composer 2.6+），并通过索引/过滤回归测试决定 Elasticsearch 版本，不要自行混搭。

### 4. PostgreSQL 路线仍有一个安装负担

PostgreSQL 16 已是官方推荐且 CI-tested，但当前 `composer.json` 即使在 PostgreSQL-only 主机上仍硬性要求 `ext-pdo_mysql`；因此需要同时安装 `pdo_mysql` 和 `pdo_pgsql`。[Requirements](https://devdocs.unopim.com/3.0/introduction/requirements.html)、[PostgreSQL 安装](https://devdocs.unopim.com/3.0/introduction/installation-with-postgresql.html)

数据库引擎不能靠切换 Docker profile 自动迁移数据；从 MySQL 改 PostgreSQL或反向切换都需要显式导出/导入或重建数据库。[Docker 安装](https://devdocs.unopim.com/3.0/introduction/installation-docker.html)

### 5. 变体能力有明确边界

3.0 支持最多两级变体；变体轴必须是 Select 类型，且不能带 Channel/Locale scope。变体结构一旦已有商品使用，轴和层级会被锁定，修改前需删除现有变体。[Product Variants](https://docs.unopim.com/3.0/products/variants.html)

这通常够覆盖 1688 的颜色×尺寸，但若某些类目存在三层以上结构，需要先在 PoC 中确定扁平化或属性映射规则。

### 6. 它仍是 PIM，不是完整分销 SaaS

官方 3.0 功能和安装器没有记录以下开箱即用能力：

- 1688 OAuth、商品详情/价格/库存同步；
- SaaS 租户注册、套餐、计费、租户生命周期；
- 跨客户强隔离的 `tenant_id`/独立数据库模型；
- 下游店铺铺货、采购下单、支付、物流和售后。

这是根据[官方 3.0 功能清单](https://docs.unopim.com/3.0/introduction/)、[官方可选包列表](https://devdocs.unopim.com/3.0/introduction/installation.html)作出的边界判断。UnoPim 可以作为“商品域底座”，但“自盈分销”仍需开发多租户门户、1688 connector 和订单/渠道模块。

### 7. `latest` 与移动分支会破坏可重复部署

官方 Compose 的默认镜像标签是 `latest`，快速启动文档从 `master` 获取 YAML；仓库安全流程又会持续把修复先提交到 `master` 后再回移。这些默认值方便体验，但生产环境必须固定 tag/digest，并把数据库 migration 放在单一 release job 中，避免多副本同时迁移。[compose.yaml](https://github.com/unopim/unopim/blob/3.0/compose.yaml)、[README 部署提示](https://github.com/unopim/unopim#installation)、[SECURITY.md](https://github.com/unopim/unopim/blob/3.0/SECURITY.md)

## 是否适合“自盈分销”新项目直接采用最新版

### 适合，但需满足以下条件

建议直接采用 **UnoPim v3.0.0**，而不是从旧的 2.1 开始，前提是把它定位为 PIM 商品内核，并完成以下门槛：

1. 固定 `v3.0.0` 源码 tag及依赖锁文件，不跟随 `master`/`3.0` branch head/`latest` image。
2. 先做 1–2 周 PoC，不立刻全量生产。
3. 使用 PostgreSQL 16 或 MySQL 8.0.32+；PoC 优先用官方 Docker 默认 PostgreSQL 组合。
4. 配好 Redis、全队列 worker、scheduler 和 Elasticsearch；不能只启动 Web 容器。
5. 需要完整图片素材库时，同时锁定并测试 DAM v3.0.0。
6. 自行开发多租户隔离、1688 OAuth/token、原始快照与编辑副本、同步任务和错误重试。
7. 对两个测试租户做越权测试：商品、SKU、图片、导入导出、搜索、Webhook 和 API token 均不可串租户。
8. 在上线前关注 v3.0.x 的第一个 patch Release；若 v3.0.1 已发布，应先阅读 changelog 并在测试环境升级，而不是直接改生产。

### 最终建议

**技术基线：UnoPim v3.0.0 + DAM v3.0.0（如需要素材库）+ PostgreSQL 16 + Redis 7 + 官方匹配的 Elasticsearch + S3/OSS对象存储。**

对“自盈分销”而言，3.0 相比 2.1 的两级变体、商品继承、自定义关联、多 Webhook、增量导出、REST API 扩展、PostgreSQL 和现代化后台都更合适；全新项目没有旧版迁移负担，因此应从 3.0 起步。与此同时，它刚经历重大升级且支持周期仍为 TBD，建议先固定 v3.0.0 做 MVP，等首个 3.0 patch 经回归验证后再进入正式商用规模。
