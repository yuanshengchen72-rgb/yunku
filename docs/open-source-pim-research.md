# 自盈分销：开源商品云库（PIM）选型调研

更新日期：2026-08-27

## 结论

1688 的“代发解决方案（服务商版）”提供接口权限和客户授权能力，不提供可直接使用的商品云库。自盈分销仍需建设自己的 SaaS 应用、数据库、图片存储、任务系统和商品管理界面。

在现有开源项目中，**UnoPim 最适合做第一阶段原型和商品资料管理引擎**。理由是 MIT 许可、Laravel 技术栈、商品族/属性/变体、素材、版本、REST API、Webhook、导入导出和 Docker 部署较完整。它不是现成的多租户 SaaS，客户隔离、1688 OAuth、计费与套餐仍需自行开发。

如果预计客户数量较多，不建议直接在第三方 PIM 的所有表、队列、搜索索引和文件路径中强行补 `tenant_id`。更稳妥的方案是：自建轻量多租户 SaaS 核心，把 UnoPim 作为可替换的商品引擎；或者在试点期为每个租户部署独立实例，验证业务后再决定是否自研共享式商品服务。

## 候选项目比较

| 项目 | 许可 | 优点 | 对自盈分销的主要问题 | 建议 |
|---|---|---|---|---|
| [UnoPim](https://github.com/unopim/unopim) | MIT | Laravel；商品族、属性、SKU/变体继承、图片与文件、版本、API、Webhook、导入导出、Docker | “多渠道”不是“多租户”；1688 接入和租户隔离需开发 | **首选，先做技术验证** |
| [AtroPIM](https://github.com/atrocore/atropim) | GPLv3 | 灵活实体/关系模型、REST API、可配置性好 | 社区和生态较小；部分能力可能依赖商业模块；闭源扩展边界需法务确认 | 第二候选 |
| [Akeneo CE](https://github.com/akeneo/pim-community-dev) | OSL 3.0 | 成熟 PIM，产品建模和生态完善 | 部署及二开偏重；不是开箱即用的外部客户多租户；滚动版本不保证小版本向后兼容 | 不建议作为首版底座 |
| [Pimcore](https://github.com/pimcore/pimcore) | POCL（Open Core） | PIM/MDM/DAM 功能强，建模能力成熟 | 当前社区许可对商业产品/服务和规模有重要限制；商业 SaaS 采用前必须获得书面许可确认 | **暂不采用** |

## 建议架构

### 1. 自盈分销 SaaS 层

- 租户、用户、角色、套餐和用量
- 每个客户自己的 1688 OAuth 授权与令牌加密存储
- API 限流、异步任务、失败重试、审计日志
- 后续的平台发布、订单、物流和售后连接器

### 2. 商品云库层

- `source_products`：1688 原始商品只读快照，以来源平台和 `offerId` 唯一标识
- `source_skus`：1688 原始 SKU、价格、库存及属性
- `tenant_products`：客户私有的可编辑商品副本
- `tenant_skus`：客户修改后的售价、编码和上下架状态
- `media_assets`：下载并托管的图片、视频、详情素材及其来源
- `sync_jobs` / `sync_logs`：导入、刷新、发布任务及错误记录
- `channel_mappings`：商品向抖店、淘宝、拼多多等渠道发布时的类目和属性映射

关键原则：原始快照与客户编辑稿分离。刷新 1688 数据时只更新来源记录，通过差异比较提示客户，不能直接覆盖客户修改。

## 多租户路线选择

1. **试点阶段（最快）**：为少量客户建立独立 PIM 实例或独立数据库，隔离简单，但运维成本随客户数量增加。
2. **规模化阶段（推荐）**：自建共享 SaaS 商品服务，所有业务表强制带 `tenant_id`，对象存储目录、缓存键、队列负载和搜索索引同样带租户边界；公共来源快照和客户编辑副本分开。
3. **不推荐**：只在 PIM 用户表增加租户字段，却忽略导出、队列、搜索、图片 URL 和后台权限；这类改造最容易造成跨客户数据泄露。

## 第一阶段验收范围

1. 客户注册并完成 1688 授权。
2. 输入 1688 商品链接或 `offerId`，异步导入标题、主图、详情、属性、SKU、价格等允许获取的数据。
3. 形成原始只读记录与客户可编辑副本。
4. 客户能够修改标题、销售价、图片、详情、分类和 SKU 编码。
5. 支持重新同步、差异提示、失败重试和完整日志。
6. 用两个测试租户验证任何列表、详情、导出、搜索、图片和任务日志均不可越权访问。

## 实施建议

先做一个 5～7 天的 UnoPim 技术验证，不立即大规模二开：Docker 部署、建立一组接近 1688 的属性族、导入一个含多 SKU 的商品、验证图片托管和 API，再验证能否通过外围 SaaS 层实现严格租户隔离。如果隔离需要侵入大量 UnoPim 内部模型，应及时转为自研商品服务，而不是继续堆补丁。

## 主要官方资料

- [UnoPim 官方仓库与 MIT License](https://github.com/unopim/unopim)
- [UnoPim 3.0 商品类型](https://docs.unopim.com/3.0/products/)
- [UnoPim 3.0 商品变体](https://docs.unopim.com/3.0/products/variants.html)
- [Akeneo Community Edition 官方仓库](https://github.com/akeneo/pim-community-dev)
- [Akeneo Community Standard OSL 3.0 License](https://github.com/akeneo/pim-community-standard/blob/main/LICENCE.txt)
- [AtroPIM 官方仓库及 GPLv3 License](https://github.com/atrocore/atropim)
- [Pimcore 当前许可条款](https://github.com/pimcore/pimcore/blob/2026.x/LICENSE.md)
- [Pimcore Community Edition 说明](https://pimcore.com/en/products/edition/community)

> 许可判断仅用于技术选型筛查，不构成法律意见。正式商用前应由法务依据部署方式、修改范围和交付方式复核许可证及 1688 数据使用条款。
