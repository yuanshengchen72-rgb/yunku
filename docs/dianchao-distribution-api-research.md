# 电潮分销 V1：1688 导入与微信小店铺货官方接口研究

> 核对日期：2026-08-29
> 范围：只使用 1688/阿里巴巴开放平台、微信开放文档、阿里云 SAE 官方资料。本文不包含实现代码。  
> 状态标记：**已明确**＝官方页面直接写明；**需实测**＝方案页列有该能力，但当前 AppKey 是否获权仍须控制台验证；**需平台确认**＝公开资料没有足够信息。
>
> 配置纠正：已登录的“电潮分销”应用详情与“已购解决方案”页面均确认 AppKey 为 `3255489`。`3432336` 是此前误报，不再作为本应用配置。AppSecret 与用户 Token 不记录在本文。
>
> 方案快照：官方“代发解决方案（服务商版）”为 **8.5 版**；2026-08-29 获取的官方详情数据列出 **148 个在线 API、40 个在线消息**，并带有 29 条 2025-02-18 至 2026-08-26 的变更记录。[官方方案页](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978)；[官方详情数据](https://open.1688.com/solution/data/getSolutionDetail.jsonp?solutionKey=1661754359978&callback=jsonp_doc)

## 一、先给结论

1. **1688 主链路可行，但不能把“方案接口清单”当成“当前 AppKey 权限清单”。**“代发解决方案（服务商版）”当前为 **8.5 版**，定位为软件开发商给下游买家提供站外采购工具，官方方案包含商品铺货、订单自动回流等能力，并要求服务市场类目选择“场景对接-买家场景-采购工具”。当前方案列出 148 个在线 API 和 40 个在线消息；当前 AppKey 是否逐项获权，仍只能在控制台“已获取能力”和 API 测试工具中确认。[1688 代发解决方案（服务商版）](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978)；[官方详情数据](https://open.1688.com/solution/data/getSolutionDetail.jsonp?solutionKey=1661754359978&callback=jsonp_doc)
2. **V1 最稳的 1688 导入入口是 `offerId → alibaba.fenxiao.productInfo.get`。**该接口明确要求用户 `access_token`，并要求 `offerId` 与 `openOfferId` 二选一。搜索、图搜、AI 选品应作为辅助入口，不能替代按商品 ID 获取详情。[获取分销商品详情接口](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.productInfo.get-1)
3. **微信小店自研模式不走第三方平台授权。**商家自己的 AppID/AppSecret 调用稳定版凭据接口，使用店铺自身 `access_token`；第三方服务商模式才使用商家授权后的 `authorizer_access_token`。稳定版 token 有效期目前为 7200 秒，官方推荐优先使用稳定版接口。[微信小店开发者使用指南](https://developers.weixin.qq.com/doc/store/shop/dev_before/guide.html)；[获取稳定版接口调用凭据](https://developers.weixin.qq.com/doc/store/shop/API/apimgnt/common/api_getstableaccesstoken.html)
4. **微信商品发布不是一次调用即结束。**先准备类目权限、发布规则、品牌/资质、图片和 SKU，调用添加/更新后进入审核；通过商品审核事件或查询商品读取结果，审核通过后再主动上架（或配置审核通过自动上架），最后查询线上状态确认。官方商品指南明确区分草稿 `edit_status` 与线上 `status`。[微信小店商品管理指南](https://developers.weixin.qq.com/doc/store/shop/guide/catalog/product.html)
5. **SAE 调微信 API 必须先解决公网出站。**SAE 实例默认没有公网 IP；推荐在聚石塔对应 VPC 配置公网 NAT 网关 + EIP，以 SNAT 获得统一固定出口 IP。如果微信小店启用 IP 白名单，应把这个固定出口 IP 加入白名单；逐实例绑定 EIP 会在扩缩容、重建或部署后变化，不适合作白名单地址。[SAE 配置公网 NAT 网关](https://help.aliyun.com/zh/sae/configure-a-nat-gateway-for-an-sae-application-to-access-internet)；[SAE EIP 方案说明](https://help.aliyun.com/zh/sae/configure-public-network-access-and-public-network-access-capabilities-of-sae-instances-based-on-eip)

## 二、1688：授权与商品侧接口

### 2.1 用户授权

面向外部客户的服务商应用，需要让每个客户用自己的 1688 账号授权；后端保存“租户—1688账号—access_token”的绑定。哪个账号授权，token 就代表哪个账号的数据权限。服务市场订购用户从“我的服务—立即使用”进入时，平台会引导授权，将授权 `code` 回调到应用配置地址，再由服务端换取 `access_token`。不要在前端保存 AppSecret 或 access_token。[1688 服务市场授权流程](https://developer.alibaba.com/docs/doc.htm?articleId=118846&docType=1&treeId=456)

V1 必须验证以下授权行为：

- 回调域名与当前应用控制台完全一致；`state` 绑定租户且只能使用一次。
- token 按租户加密保存，并记录失效时间；刷新能力、刷新有效期以该 AppKey 实际授权响应为准。
- 每个商品接口先用该租户 token 调用，禁止跨租户复用。

### 2.2 方案页当前列出的商品相关接口

| 能力 | 官方接口 | V1 用法与限制 | 权限判断 |
|---|---|---|---|
| 按 ID 获取商品详情 | [`alibaba.fenxiao.productInfo.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.productInfo.get-1) | 要求用户 `access_token`；`offerId`、加密 `openOfferId` 二选一。作为 V1 导入标题、价格、SKU、图片、详情等信息的主入口。 | **方案在线；当前 AppKey 待核验** |
| 国内分销关键词搜索 | [`product.keywords.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aproduct.keywords.search-1) | 要求用户 token。官方页说明其选品池标签包含 454466（现货、48小时、一件代发包邮、7天无理由退换）和 454658（严选优质品等），`filter` 为空或标签无效时返回两个标签全集。不能理解为全站任意商品搜索。 | **方案在线；当前 AppKey 待核验** |
| 商品关键词搜索 | [`product.keyword.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aproduct.keyword.search-1) | 方案页同时列出。与“国内分销词搜”的数据池、字段和准入并不相同，V1 应分别用真实 token 测试，不应混成一个接口。 | **方案在线；当前 AppKey 待核验** |
| 图搜内贸代发商品 | [`alibaba.public.image.similar.offer.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.public.image.similar.offer.search-1) | 用于以图片寻找内贸代发商品。V1 可后置，不是 offerId 导入的前置依赖。 | **需实测** |
| 查询类目 | [`alibaba.category.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.category.get-1) | 按类目 ID 查询 1688 类目信息，用于构造 1688→内部→微信类目映射。 | **方案在线；当前 AppKey 待核验** |
| 叶子类目属性 | [`alibaba.category.attribute.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.category.attribute.get-1) | 获取叶子类目属性；不能直接当作微信小店属性，仍需做平台间映射。 | **方案在线；当前 AppKey 待核验** |
| AI 深度选品 | [`open.agent.deepSearch`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.ai%3Aopen.agent.deepSearch-1) | 方案页当前列入“选品”。它不是一个稳定的“通用推荐列表”替代品，应作为独立增值能力验证配额、输入和返回稳定性。 | **需实测/可能额外准入** |
| 同款/换供 | [`supply.similarOffer.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Asupply.similarOffer.search-1)、[`offer.similar.getList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aoffer.similar.getList-1) | 面向换供和同款检索，不等于普通商品推荐；建议放到 V1 之后。 | **需实测/可能额外准入** |

### 2.3 图片处理边界

- 1688 方案页的商品主链路是“商品详情返回图片/详情素材”，没有把单独“1688 图片上传接口”列为云库导入的必要步骤。V1 应保存原始图片 URL/原始响应快照，并建立可编辑副本；不要覆盖原始数据。
- 铺货到微信时不能假定 1688 图片 URL 可直接长期使用，应通过微信的[上传图片接口](https://developers.weixin.qq.com/doc/store/shop/API/apimgnt/resource/api_img_upload.html)上传到微信侧，取得可供后续接口使用的媒体标识。
- 1688 方案页明确要求接口返回数据合理合规，禁止利用开放数据进行不正当竞争或相关推荐。图片二次存储、裁剪、去水印、跨客户共享和对外展示的授权范围，公开方案页没有给出完整许可，属于**需平台/商品权利人确认**；V1 不应默认拥有图片著作权或去水印权。[1688 代发服务商方案的数据使用规范](https://open.1688.com/solution/solutionDetail.htm?solutionKey=1661754359978#solutionDesc)

### 2.4 “方案接口清单”与“AppKey 实际权限”必须分开

已登录控制台已确认“电潮分销”的 AppKey 为 `3255489`，但“已购方案”仍不能证明 148 个 API 和 40 个消息已全部分配并可调用；必须在 OAuth 联调时完成带结果的验收表：

1. 打开“能力管理—已获取能力”，逐个核对接口名。
2. 在 API 测试工具中使用测试授权账号调用；记录“成功、无权限、参数错误、配额不足”四类结果。
3. 优先验证 `alibaba.fenxiao.productInfo.get`、`product.keywords.search`、`alibaba.category.get`、`alibaba.category.attribute.get`。
4. 搜索、图搜、AI、换供若未获权，不阻塞 offerId 导入 V1；商品详情若未获权则直接阻塞 V1。

### 2.5 方案 8.5 的完整能力边界与依赖流程

官方方案说明的适用角色是“可提供站外采购工具供下游买家铺货的 ISV 服务商”，主业务目标是把 1688 代发商品铺到站外渠道、将站外订单回流到 1688，并支持多种支付方式。服务市场售卖流程为“申请角色资质 → 订购解决方案 → 获取增值调用量 → 开发应用 → 提交售卖”，类目选择“场景对接—买家场景—采购工具”。[方案 8.5 概述与售卖流程](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978#solutionDesc)

当前官方详情数据把能力分成 16 个 API 类别和 9 个消息类别。下列顺序是按官方接口说明和方案流程整理的实现依赖，不表示 AppKey 已自动拥有每项权限：[完整方案详情数据](https://open.1688.com/solution/data/getSolutionDetail.jsonp?solutionKey=1661754359978&callback=jsonp_doc)

| 链路 | 建议依赖顺序 | 关键消息/补偿查询 |
|---|---|---|
| OAuth 与租户 | 用户授权 → `alibaba.account.basic` 识别授权账号 → 按租户保存 Token | `AUTHORIZATION_SUCCESS`、`AUTHORIZATION_CANCEL`；取消后立即停用该租户新任务 |
| 铺货建档 | 添加站外店铺 → 搜索/按 ID 获取商品详情 → 建立买卖家/站外商品关系 → 记录铺货次数 | 商品关系视角新增、修改、上下架、删除、审核、库存，以及 `FENXIAO_OFFER_CHANGE`/`FENXIAO_PRICE_CHANGE` |
| 下单 | 运费模板与地址码 → `createFenxiaoOrder.preview` 校验商品、关系、库存、起批与混批 → `fenxiaoOrder.create` | 创建、付款、改价、关闭、确认收货、交易成功消息；列表/详情查询作为补偿 |
| 支付 | 查询支付渠道/协议 → 收银台或免密支付；先采后付需先校验大客户、申请权益、查询开通状态 | `ORDER_BATCH_PAY`、`ORDER_BUYER_VIEW_ORDER_PAY`；免密支付失败只做有限重试 |
| 履约 | 买家订单列表/详情 → 物流详情/轨迹 → 确认收货 | 发货、部分发货、物流轨迹、物流单号修改、交易成功消息 |
| 退款售后 | 最大可退金额/退款原因 → 创建或修改退款 → 上传凭证 → 卖家同意后回传退货物流 → 查询退款详情/记录 | 售中/售后退款消息；站外售后还需 `fenxiao.order.createReverseOrder` 回流 |
| 代发推单 | 查询合作供应商 → 单笔/批量创建代发单 → 查询/取消/确认收货/异常标记 → 对账 | 代发主单、子单、售后、对账状态消息；查询接口补偿漏消息 |
| 寻源 | 校验大客户/需求 → 获取类目或主题日历 → 创建换供/主题需求 → 查询需求与结果 → 回传操作记录 | 官方方案未列专用寻源消息，需轮询需求/结果列表 |
| 同款换供 | `startTask` → `fetchIdList`/`similarOffer.search` → `stop`；站外批量图搜可用 `offer.similar.getList` | agent 模式先添加监控，再接收 `AGENT_SUPPLY_CHANGE_RECOMMEND`，处理后回流效果数据 |
| 云仓退货 | 查询物流公司 → 创建 1688 退款 → 检查云仓开通 → 查询云仓 → 创建云仓订单 → 查询订单 | `LOGISTICS_OFFICIAL_WAREHOUSE_OUTBOUND`，必要时调用 `warehouse.order.outbound` 更新/下发出仓地址 |
| 采购金 | 支付咨询 → 申请 → 状态查询/支付结果消息 → 订单核销；退款申请 → 状态查询/退款结果消息 | 两个采购金结果消息都必须幂等处理；金额单位按接口文档为分 |
| 发票 | 查询可开票订单 → 发票抬头/可开金额 → 普通申请，或先 `trade.invoice.consult` 再 `trade.invoice.mergeapply` | 申请列表与已开票列表做结果查询；合并开票咨询是提交合并开票的前置 |

权限与授权必须分三层判断：

1. **已购方案**：只证明 AppKey `3255489` 关联了方案，不证明所有接口已分配。
2. **能力分配**：在“能力管理—已获取能力”核对 API/消息是否已分配到应用。
3. **用户授权与业务准入**：标有用户授权的接口必须使用相应 1688 用户 Token；大客户、先采后付、云仓、即时零售、严选、企业采购等能力还可能需要业务身份或专项准入。最终以每个接口文档和真实调用结果为准。

方案文档有两处需要特别防误读：

- “先采后付”流程文字把 T2/T3 名称与链接对应反了；当前在线 API 清单显示 `fenxiao.benefit.createCreditBenefit` 是“用户申领先采后付大客权益”，`fenxiao.benefit.checkCreditBenefit` 是“查询用户先采后付开通状态”。实现应以各自 API 文档为准。[方案概述](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978#solutionDesc)
- “最近更新”仍提到 `paycredit.openStatus.query`，但它不在当前 8.5 的 148 个在线 API 清单中。不要仅凭旧更新说明调用，需先在“已获取能力”确认。[方案当前 API 清单](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978#apiAndMessageList)

开发人员参考页目前只对 `alibaba.fenxiao.buyer.outproduct.relation.add` 给出额外字段规范：`distributionTime`（现货/预售与发货时效）、`distributionPrice`（公式/固定/自定义定价及小数处理）、`distributionPost`（跟随 1688 或自定义包邮区域）和 `distributionReverseService`（七天无理由、赔付、联保、二手状态）。这些字段是建立站外铺货关系时的元数据，不属于 `productInfo.get` 的商品详情返回。[开发人员参考](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978#developmentReference)

方案页提供 Java、Python、PHP、.NET 四种 SDK 下载，并说明 SDK 已封装签名/验签；页面没有列出 JavaScript/TypeScript SDK。当前仓库自行实现通用签名和 HTTP 客户端是可行路线，但新增接口必须继续用官方参数与签名规则逐项测试，不应照抄页面的 Java 示例或把 SDK 下载包提交到仓库。[SDK 与调用说明](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978#sdk)

### 2.6 与当前仓库和技术方案的差距

仓库目前已经有通用签名/API 客户端、OAuth 授权码换 Token 与刷新、按租户加密保存授权，以及 `alibaba.fenxiao.productInfo.get` 的真实连接器；这足够完成当前“按 Offer ID 导入商品详情”的部署目标。[API 客户端](../src/connectors/alibaba1688/api-client.ts)；[OAuth 客户端](../src/connectors/alibaba1688/oauth.ts)；[真实连接器](../src/connectors/alibaba1688/real-connector.ts)

但方案 8.5 的完整闭环尚未实现：

| 能力 | 当前仓库状态 | 对 V1/正式售卖的影响 |
|---|---|---|
| OAuth + `productInfo.get` | 已实现并有单元测试，待真实账号授权调用 | 当前部署目标的核心 |
| 站外店铺/商品关系与铺货次数 | 未实现 | 不阻塞只读导入，但会阻塞官方“铺货关系”闭环 |
| 商品/价格/库存/授权消息 | 未实现 | 无法自动同步源商品变化；后续需消息幂等、补偿查询和租户路由 |
| 1688 分销下单、支付、履约、退款 | 未实现 | 不阻塞商品导入；可能阻塞服务市场完整验收 |
| 站外订单/售后回流 | 未实现 | 官方方案明确包含订单自动回流，正式售卖前必须向审核方确认最小交付范围 |
| 代发推单、对账、云仓、采购金、发票 | 未实现 | 属于后续业务能力，按客户场景和专项准入分阶段接入 |
| 搜索、图搜、寻源、换供、agent | 未实现 | 不阻塞 Offer ID 主链路，可按附录清单扩展 |

现有技术方案把“订单回流暂缓”标为审核风险是正确的，但后续不能把附录 A/B 中的“方案在线”误写成“仓库已支持”或“AppKey 已获权”。[V1 技术方案](./dianchao-distribution-v1-technical-design.md)

## 三、微信小店：自研模式商品全链路

### 3.1 Token 与调用模式

| 项目 | 官方规则 | V1 决策 |
|---|---|---|
| 自研模式 | 小店后台“服务市场—经营工具—自研”取得 AppID/AppSecret；使用小店自身 `access_token`。[开发者使用指南](https://developers.weixin.qq.com/doc/store/shop/dev_before/guide.html) | 单店自研按此模式，不接第三方平台 `authorizer_access_token`。 |
| Token | `POST /cgi-bin/stable_token`，传 `grant_type=client_credential`、AppID、AppSecret；有效期目前 7200 秒。普通模式重复调用不会刷新；强制刷新会使旧 token 失效且每日限 20 次、至少间隔 30 秒。[稳定版 token](https://developers.weixin.qq.com/doc/store/shop/API/apimgnt/common/api_getstableaccesstoken.html) | 中央 token 服务缓存，提前刷新；不要每次业务调用都刷新。 |
| 调用位置 | 商品接口均明确要求服务器端调用，不可在小程序、网页或 App 前端直接调用。[添加商品](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_addproduct.html) | AppSecret/token 只放聚石塔 SAE 服务端。 |
| IP 白名单 | 官方标为“按需”；最多 200 个 IP，不支持 `IP:端口`；启用后未匹配来源返回 403；删除全部 IP 后白名单失效。[开发者使用指南—IP白名单](https://developers.weixin.qq.com/doc/store/shop/dev_before/guide.html#ip-%E7%99%BD%E5%90%8D%E5%8D%95) | 生产建议启用，并只填 NAT 网关固定 EIP。 |

### 3.2 发品前置接口

| 目的 | 接口 | 关键约束 |
|---|---|---|
| 取得全部类目 | [`GET /shop/ec/category/all`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-category/api_getallcategory.html) | 返回全量类目及类目/商品资质信息，用于缓存基础类目树。 |
| 取得叶子类目详情、属性和资质要求 | [`POST /shop/ec/category/detail`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-category/api_getcategorydetail.html) | 按叶子类目获取发布所需属性、必填标记和商品资质要求。 |
| 检查本店类目权限 | [`/shop/ec/category/get_category_relation_list`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-category/api_getcategoryrelationlist.html)、[`.../get_category_relation_detail`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-category/api_getcategoryrelationdetail.html) | “平台存在该类目”不等于“该店已获经营权限”。 |
| 发品前校验 | [`POST /channels/ec/product/categoryprecheck`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_categoryprecheck.html) | 校验店铺是否具备发该类商品的权限/资质。 |
| 获取类目发布规则 | [`POST /shop/ec/category/getcategoryproductrule`](https://developers.weixin.qq.com/doc/store/shop/API/category-rule/api_getcategoryproductrule.html) | 官方商品指南将其列为发品前步骤；运费、售后、资质等必须按返回规则组装。 |
| 查询可用品牌 | [`GET /shop/ec/brand/all`](https://developers.weixin.qq.com/doc/store/shop/API/brand/api_getallbrandslogic.html)、[`/channels/ec/brand/valid/list/get`](https://developers.weixin.qq.com/doc/store/shop/API/brand/api_getvalidbrandlistlogic.html) | 发布时优先使用店铺当前生效品牌；无品牌值按添加商品接口说明处理。需要品牌资质时先申请并通过。 |
| 类目/属性映射辅助 | [`/channels/ec/product/category/classify`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_product_classify.html)、[`.../externalproductmappingnew`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_externalproductmappingnew.html) | 可根据标题、主图、详情和站外属性做类目/属性推荐，但最终仍要通过类目权限与发布规则校验。 |
| 上传图片 | [`POST /shop/ec/basics/img/upload`](https://developers.weixin.qq.com/doc/store/shop/API/apimgnt/resource/api_img_upload.html) | 上传后取得 `media_id` 供其他接口使用；不要直接把外部临时地址当永久素材。 |

### 3.3 添加、更新、SKU、库存、审核与上架

| 阶段 | 接口 | V1 要点 |
|---|---|---|
| 添加商品 | [`POST /channels/ec/product/add`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_addproduct.html) | `out_product_id` 最长 128 字符且成功后不可修改，平台不保证唯一，必须由电潮自行保证；标题最多 60 字符；主图一般 3–9 张（食品饮料/生鲜至少 4 张）；详情图 1–50 张（上述类目至少 3 张）；SKU 1–500 个；部分类目属性和商品资质必填；`listing` 默认 0。 |
| 更新商品 | [`POST /channels/ec/product/update`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_updateproduct.html) | 普通更新写入草稿并重新走审核；审核通过并上架后才覆盖线上数据。 |
| 免审更新 | [`POST /channels/ec/product/auditfree`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_updateproductauditfree.html) | 只用于官方允许的免审字段，直接修改线上版本，不修改编辑草稿；不能把它当作通用更新接口。 |
| 查询商品与状态 | [`POST /channels/ec/product/get`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_getproduct.html)、[`.../list/get`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_getproductlist.html) | 读取草稿 `edit_status` 和线上 `status`。官方指南列出：`edit_status=2` 审核中、3 审核失败、4 审核成功、7 异步上传中；`status=5` 为已上架。 |
| 审核通知 | [商品审核事件 `product_spu_audit`](https://developers.weixin.qq.com/doc/store/shop/notify/product_callback/ProductSpuAudit.html) | 作为主通道接收审核结果；查询商品作为补偿轮询，避免只靠回调丢事件。 |
| 主动上架 | [`POST /channels/ec/product/listing`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_listingproduct.html) | 审核通过后调用；也可通过[商品上架策略](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/shop/api_setproductauditstrategy.html)配置审核通过自动上架。V1 建议先人工可控的主动上架。 |
| 库存读写 | [`POST /channels/ec/product/stock/get`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/stock/api_getstock.html)、[`.../stock/update`](https://developers.weixin.qq.com/doc/store/shop/API/channels-shop-product/stock/api_updatestock.html) | 商品创建后按微信 `product_id + sku_id` 更新库存；不要用 1688 SKU ID 直接替代微信 SKU ID，需持久化映射。 |

微信官方商品指南明确的总体顺序是“前置准备 → 数据组装 → 提交审核 → 审核通过 → 上架”；首次添加和普通更新都可能产生草稿，只有审核通过并上架后才正式成为线上版本。[商品管理指南](https://developers.weixin.qq.com/doc/store/shop/guide/catalog/product.html)

## 四、聚石塔 SAE 调微信 API 的网络设计

### 4.1 出网与固定 IP

- **已明确：**SAE 应用实例默认没有公网 IP，不能直接访问公网资源；给 VPC 配置公网 NAT 网关即可让 SAE 主动访问 `api.weixin.qq.com`。[配置公网 NAT 网关使 SAE 访问公网](https://help.aliyun.com/zh/sae/configure-a-nat-gateway-for-an-sae-application-to-access-internet)
- **已明确：**NAT 网关 + EIP 的 SNAT 能把多个 SAE 实例的请求转换为统一固定公网 IP，适合第三方服务白名单。[SAE 公网访问方案](https://help.aliyun.com/zh/sae/configure-public-network-access-and-public-network-access-capabilities-of-sae-instances-based-on-eip)
- **已明确：**逐实例绑定 EIP 时，实例重建、迁移或重新部署后 EIP 可能变化；这不适合微信 IP 白名单，也会影响自动扩缩容。[SAE EIP 说明](https://help.aliyun.com/zh/sae/configure-public-network-access-and-public-network-access-capabilities-of-sae-instances-based-on-eip)
- **已明确：**微信小店 IP 白名单当前是“按需”，但一旦启用，非白名单来源请求返回 403。[微信小店开发者使用指南](https://developers.weixin.qq.com/doc/store/shop/dev_before/guide.html#ip-%E7%99%BD%E5%90%8D%E5%8D%95)

因此生产推荐：**聚石塔 SAE（私网）→ VPC 公网 NAT 网关 → 固定 EIP → 微信 API**。公网 CLB 解决的是入站访问，不替代出站 SNAT。测试环境若暂不启用白名单仍需可出网；正式环境启用白名单前先确认 NAT EIP，再写入微信后台。

## 五、V1 阻塞项

| 优先级 | 阻塞项 | 为什么会阻塞 | 解除标准 |
|---|---|---|---|
| P0 | 1688 核心接口尚未完成授权调用 | 当前 AppKey 已显示接口可选，但还没有用真实授权 Token 验证返回 | `productInfo.get` 用测试授权账号成功返回；关键词/类目接口逐项记录结果 |
| P0 | 聚石塔 SAE 公网出站未配置 | 无公网出站无法获取微信 token 或调用任何微信商品接口 | NAT 网关 + 固定 EIP 可访问 `api.weixin.qq.com`，并完成微信白名单验证（若启用） |
| P0 | 微信小店自研凭据及权限未确认 | 无 AppID/AppSecret/token 无法开始 | 能从自研入口取得凭据并调用稳定版 token、店铺基本信息 |
| P0 | 微信类目权限/资质/品牌未通过 | 有类目数据不等于该店可发布；发品会被拒绝 | 目标类目权限有效，`categoryprecheck` 通过，必要品牌/商品资质已生效 |
| P0 | 1688→微信类目、属性、SKU 映射未固化 | 两个平台 ID、属性语义、价格单位不同，不能直接复制 | 至少完成一个目标类目的映射模板和一件真实商品端到端测试 |
| P1 | 图片权利及处理边界未书面确认 | 1688 仅明确数据应合理合规，未公开授予任意二改/去水印/跨客户共享权 | 保留来源与原图；确认可用于下游铺货；禁止默认去水印和跨租户共享 |
| P1 | 微信审核事件回调与补偿查询未完成 | 只提交不跟踪，无法可靠知道何时可上架 | 审核事件验签、幂等处理成功；查询商品补偿任务可恢复漏事件 |
| P1 | 服务市场审核范围与当前 V1 不完全一致 | 1688 官方完整方案明确包含“铺货 + 订单自动回流”；若 V1 只做商品导入/微信发品，可能被审核认为功能不完整 | 提交售卖前向官方群/审核人确认阶段性交付是否允许，或补齐最小订单回流演示 |

### 关于“订单回流暂缓”的单独风险说明

**官方明确：**代发服务商方案的内容概述包含“批量铺货到下游平台，并支持订单自动回流及多种支付方式”。[方案概述](https://open.1688.com/solution/solutionDetail.htm?solutionKey=1661754359978#solutionDesc)

因此，“电潮分销 V1 暂不做订单回流”可以作为内部迭代范围，但不能自动推导为满足正式服务市场审核。建议：

1. 技术上把订单、采购、物流模块留出接口边界，不在商品模型里写死“永远无订单”。
2. 提交售卖前拿产品说明向 1688 审核人书面确认 V1 是否允许只交付“导入 + 编辑 + 微信发品”。
3. 若审核要求完整闭环，至少补齐订单回流的演示链路后再提交售卖，而不是临时改变商品模块。

## 六、推荐的最小 API 调用顺序

### A. 一次性环境验收

1. 1688 控制台确认接口已获取，并用 API 测试工具验证 `productInfo.get`。
2. 聚石塔 SAE 配置 VPC、NAT 网关和固定 EIP；验证 DNS、TLS 和 `api.weixin.qq.com` 出站。
3. 微信后台确认自研模式 AppID/AppSecret；按需启用 IP 白名单并加入 NAT EIP。
4. 调用微信稳定版 token，再调用店铺基本信息，验证凭据、网络和白名单。

### B. 每个客户授权与 1688 导入

1. 客户订购/进入服务 → 1688 授权 → 回调 `code` → 服务端换 token并绑定租户。
2. 用户输入 `offerId`。
3. 调用 `alibaba.fenxiao.productInfo.get` 获取详情；保存**原始响应快照**。
4. 将标题、价格、图片、详情、SKU、属性转换成**租户可编辑副本**；保存 `1688_offer_id / 1688_sku_id` 映射。
5. 如需搜索入口，再调用 `product.keywords.search`；从搜索结果选中 offer 后仍回到第 3 步取详情。

### C. 单件商品铺到微信小店

1. 获取/复用稳定版 `access_token`。
2. 获取类目树 → 叶子类目详情 → 本店类目权限 → 发品前校验 → 类目发布规则。
3. 查询生效品牌；把 1688 类目/属性转换为微信类目、属性和品牌；补齐资质、运费模板、退货地址等规则要求。
4. 上传主图、详情图和资质图片到微信侧。
5. 调用 `channels/ec/product/add`，先使用 `listing=0`；保存微信 `product_id`、每个 `sku_id` 与内部/1688 SKU 的映射。
6. 接收商品审核事件，同时用 `channels/ec/product/get` 补偿查询；`edit_status=3` 返回审核原因供用户修改，`edit_status=4` 才进入上架。
7. 调用 `channels/ec/product/listing`。
8. 再次查询商品，确认 `status=5`；随后库存变化走 `channels/ec/product/stock/update`。

## 七、开工前的最小验证样本

不要一开始覆盖所有类目。先选择一个无需特殊品牌/资质、SKU 不超过 10 个的一件代发商品，完成以下验收：

- 1688 授权成功，按 offerId 返回完整商品和 SKU。
- 原始快照与编辑副本严格分离。
- 1688 图片经微信上传后可正常发品。
- 微信类目、必填属性、价格单位、SKU 规格和库存映射正确。
- 审核失败能展示官方原因；审核成功后能上架并查询到 `status=5`。
- 所有 1688 token、微信 token、图片和商品映射均按租户隔离；日志不打印 AppSecret/access_token。

完成这一件商品的闭环后，再扩展词搜、图搜、AI 推荐和多类目映射。

## 附录 A：方案 8.5 全量在线 API（148 项）

本附录逐项抄录官方详情数据中的 `onlineApiModules`。名称用于说明用途；链接指向对应官方 API 文档。是否“需要授权”、具体参数、频控与业务准入以链接页面和 AppKey 实测为准。[清单数据源](https://open.1688.com/solution/data/getSolutionDetail.jsonp?solutionKey=1661754359978&callback=jsonp_doc)

### A.1 铺货（34）

| 用途 | 官方 API |
|---|---|
| 获取分销商品详情 | [`alibaba.fenxiao.productInfo.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.productInfo.get-1) |
| 添加分销店铺（买家） | [`alibaba.fenxiao.buyer.outshop.add`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.buyer.outshop.add-1) |
| 删除分销店铺（买家） | [`alibaba.fenxiao.buyer.outshop.delete`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.buyer.outshop.delete-1) |
| 添加分销商品关系（买家） | [`alibaba.fenxiao.buyer.outproduct.relation.add`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.buyer.outproduct.relation.add-1) |
| 查询分销商品关系（买家） | [`alibaba.fenxiao.buyer.outproduct.relation.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.buyer.outproduct.relation.get-1) |
| 删除分销商品关系（买家） | [`alibaba.fenxiao.buyer.outproduct.relation.delete`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.buyer.outproduct.relation.delete-1) |
| 获取授权用户基本信息 | [`alibaba.account.basic`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.account%3Aalibaba.account.basic-1) |
| 设置用户铺货次数 | [`product.distribute.cnt.put`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aproduct.distribute.cnt.put-1) |
| 获取用户铺货次数 | [`product.distribute.cnt.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aproduct.distribute.cnt.get-1) |
| 生成分销测试 dkey | [`dkey.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Adkey.get-1) |
| 关注商品 | [`alibaba.product.follow`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.product.follow-1) |
| 解除关注商品 | [`alibaba.product.unfollow.crossborder`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.product.unfollow.crossborder-1) |
| 按商品 ID 添加买卖家分销关系 | [`alibaba.fenxiao.relationadd`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.relationadd-1) |
| 获取铺货单列表 | [`fenxiao.distributebill.getList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.distributebill.getList-1) |
| 清除铺货单 | [`fenxiao.distributebill.removeall`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.distributebill.removeall-1) |
| 图搜内贸代发商品 | [`alibaba.public.image.similar.offer.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.public.image.similar.offer.search-1) |
| 商品关键词搜索 | [`product.keyword.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aproduct.keyword.search-1) |
| 国内分销词搜 | [`product.keywords.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aproduct.keywords.search-1) |
| 按类目 ID 查询类目 | [`alibaba.category.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.category.get-1) |
| 获取叶子类目属性 | [`alibaba.category.attribute.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.category.attribute.get-1) |
| 回传铺货失败信息 | [`product.distributionFailed.feedback`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aproduct.distributionFailed.feedback-1) |
| 回传分销店铺添加失败信息 | [`buyer.outshop.feedback`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Abuyer.outshop.feedback-1) |
| 查询通淘铺货风险预警 | [`fenxiao.risk.queryGoodsRisk`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.risk.queryGoodsRisk-1) |
| 查询店铺品牌关系授权 | [`fenxiao.brand.queryAuth`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.brand.queryAuth-1) |
| 查询卖家混批设置 | [`alibaba.trade.OpQueryMarketingMixConfig`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.OpQueryMarketingMixConfig-1) |
| 查询爆品详情 | [`fenxiao.hitlab.queryHitLabItem`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.hitlab.queryHitLabItem-1) |
| 查询商品 AI 素材详情 | [`fenxiao.aimaterial.getDetail`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.aimaterial.getDetail-1) |
| 按 dkey 查询爆品列表 | [`fenxiao.hitlab.queryHitLabBatch`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.hitlab.queryHitLabBatch-1) |
| 查询分销 AI 客服铺货知识库 | [`fenxiao.support.queryKnowledge`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.support.queryKnowledge-1) |
| 查询严选 4.0 商品 | [`alibaba.jsls.yxQuery`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.jsls.yxQuery-1) |
| 同步即时零售外部租户 | [`alibaba.jsls.syncTenant`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.jsls.syncTenant-1) |
| 同步即时零售外部供货数据 | [`alibaba.jsls.syncSupplyData`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.jsls.syncSupplyData-1) |
| 同步即时零售外部商品链接关系 | [`alibaba.jsls.syncSelectionLinkRel`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.jsls.syncSelectionLinkRel-1) |
| 查询企业采购自营商品 | [`qycg.selfOpItem.getList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.industrial%3Aqycg.selfOpItem.getList-1) |

### A.2 下单（15）

| 用途 | 官方 API |
|---|---|
| 获取物流模板详情 | [`alibaba.logistics.myFreightTemplate.list.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Aalibaba.logistics.myFreightTemplate.list.get-1) |
| 根据地址解析地区码 | [`alibaba.trade.addresscode.parse`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.addresscode.parse-1) |
| 获取交易地址代码表详情 | [`alibaba.trade.addresscode.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.addresscode.get-1) |
| 获取交易地址下一级信息 | [`alibaba.trade.addresscode.getchild`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.addresscode.getchild-1) |
| 创建分销订单前预览 | [`alibaba.trade.createFenxiaoOrder.preview`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.trade.createFenxiaoOrder.preview-1) |
| 创建普通订单前预览 | [`alibaba.createOrder.preview`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.createOrder.preview-1) |
| 创建分销订单 | [`alibaba.trade.fenxiaoOrder.create`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.fenxiaoOrder.create-1) |
| 取消交易 | [`alibaba.trade.cancel`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.cancel-1) |
| 查询营销活动价格 | [`alibaba.cps.queryOfferDetailActivity`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.p4p%3Aalibaba.cps.queryOfferDetailActivity-1) |
| 修改订单备忘 | [`alibaba.order.memoAdd`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.order.memoAdd-1) |
| 更新外部订单脱敏信息 | [`trade.encryptOutOrderInfo.modify`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.encryptOutOrderInfo.modify-1) |
| 领取商品最优优惠券 | [`coupon.optimal.claim`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.marketing%3Acoupon.optimal.claim-1) |
| 买家申请修改收货地址 | [`order.receiveAddress.buyerUpdate`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aorder.receiveAddress.buyerUpdate-1) |
| 获取密文发货商家微信小店 ID | [`ciphertext.weixin.getShopId`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aciphertext.weixin.getShopId-1) |
| 查询复购合约 | [`repurchase.contract.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Arepurchase.contract.get-1) |

### A.3 支付（8）

| 用途 | 官方 API |
|---|---|
| 查询是否开通代扣协议 | [`alibaba.trade.pay.protocolPay.isopen`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.pay.protocolPay.isopen-1) |
| 查询订单支持的支付渠道 | [`alibaba.trade.payWay.query`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.payWay.query-1) |
| 查询买家账期授信 | [`alibaba.accountPeriod.list.buyerView`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.accountPeriod.list.buyerView-1) |
| 获取组合收银台 URL | [`alibaba.trade.grouppay.url.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.grouppay.url.get-1) |
| 发起免密支付 | [`alibaba.trade.pay.protocolPay.preparePay`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.pay.protocolPay.preparePay-1) |
| 查询是否分销大客户 | [`fenxiao.benefit.checkKaUser`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.benefit.checkKaUser-1) |
| 申请先采后付大客权益 | [`fenxiao.benefit.createCreditBenefit`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.benefit.createCreditBenefit-1) |
| 查询先采后付开通状态 | [`fenxiao.benefit.checkCreditBenefit`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.benefit.checkCreditBenefit-1) |

### A.4 履约（11）

| 用途 | 官方 API |
|---|---|
| 订单列表（买家视角） | [`alibaba.trade.getBuyerOrderList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.getBuyerOrderList-1) |
| 订单详情（买家视角） | [`alibaba.trade.get.buyerView`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.get.buyerView-1) |
| 获取订单物流信息（买家视角） | [`alibaba.trade.getLogisticsInfos.buyerView`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Aalibaba.trade.getLogisticsInfos.buyerView-1) |
| 获取订单物流轨迹（买家视角） | [`alibaba.trade.getLogisticsTraceInfo.buyerView`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Aalibaba.trade.getLogisticsTraceInfo.buyerView-1) |
| 查询自联物流公司列表 | [`alibaba.logistics.OpQueryLogisticCompanyList.offline`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Aalibaba.logistics.OpQueryLogisticCompanyList.offline-1) |
| 买家确认收货 | [`trade.receivegoods.confirm`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.receivegoods.confirm-1) |
| 催卖家发货 | [`logistics.delivery.urge`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Alogistics.delivery.urge-1) |
| 回传分销售后订单 | [`fenxiao.order.createReverseOrder`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.order.createReverseOrder-1) |
| 查询全部物流公司 | [`alibaba.logistics.OpQueryLogisticCompanyList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Aalibaba.logistics.OpQueryLogisticCompanyList-1) |
| 获取跟单汇总数据 | [`trade.track.getSummary`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.track.getSummary-1) |
| 查询商家退货地址 | [`refund.address.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Arefund.address.get-1) |

### A.5 退款（23）

| 用途 | 官方 API |
|---|---|
| 创建退款退货申请 | [`alibaba.trade.createRefund`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.createRefund-1) |
| 查询退款退货原因 | [`alibaba.trade.getRefundReasonList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.getRefundReasonList-1) |
| 上传退款退货凭证 | [`alibaba.trade.uploadRefundVoucher`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.uploadRefundVoucher-1) |
| 查询退款单列表（买家视角） | [`alibaba.trade.refund.buyer.queryOrderRefundList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.refund.buyer.queryOrderRefundList-1) |
| 按订单 ID 查询退款单 | [`alibaba.trade.refund.OpQueryBatchRefundByOrderIdAndStatus`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.refund.OpQueryBatchRefundByOrderIdAndStatus-1) |
| 按退款单 ID 查询详情 | [`alibaba.trade.refund.OpQueryOrderRefund`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.refund.OpQueryOrderRefund-1) |
| 查询退款操作记录 | [`alibaba.trade.refund.OpQueryOrderRefundOperationList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.refund.OpQueryOrderRefundOperationList-1) |
| 买家提交退货物流 | [`alibaba.trade.refund.returnGoods`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.refund.returnGoods-1) |
| 取消退款退货申请 | [`alibaba.trade.cancelRefund`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.cancelRefund-1) |
| 查询官方上门揽退方案 | [`refundofficialdelivery.solution.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Arefundofficialdelivery.solution.get-1) |
| 创建官方上门揽退订单 | [`refundofficialdelivery.order.create`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Arefundofficialdelivery.order.create-1) |
| 取消官方上门揽退订单 | [`refundofficialdelivery.order.cancel`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Arefundofficialdelivery.order.cancel-1) |
| 修改官方上门揽退订单 | [`refundofficialdelivery.order.modify`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Arefundofficialdelivery.order.modify-1) |
| 获取官方上门揽退订单详情 | [`refundofficialdelivery.order.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Arefundofficialdelivery.order.get-1) |
| 查询退货物流轨迹 | [`refund.logisticsTraceInfo.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Arefund.logisticsTraceInfo.get-1) |
| 创建云仓订单 | [`fenxiao.warehouse.createOrder`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.warehouse.createOrder-1) |
| 查询云仓订单详情 | [`fenxiao.warehouse.queryOrderDetail`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.warehouse.queryOrderDetail-1) |
| 查询用户是否开通云仓 | [`fenxiao.warehouse.checkWarehouseOpenStatus`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.warehouse.checkWarehouseOpenStatus-1) |
| 查询云仓列表 | [`fenxiao.warehouse.queryWarehouseList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.warehouse.queryWarehouseList-1) |
| 修改退款退货申请 | [`alibaba.trade.modifyRefund`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.modifyRefund-1) |
| 同步云仓地址 | [`fenxiao.warehouse.syncWarehouseAddress`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.warehouse.syncWarehouseAddress-1) |
| 查询最大可退费用 | [`alibaba.trade.getMaxRefundFee`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Aalibaba.trade.getMaxRefundFee-1) |
| 更新/下发退货仓出仓地址 | [`warehouse.order.outbound`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.logistics%3Awarehouse.order.outbound-1) |

### A.6 服务市场（3）

| 用途 | 官方 API |
|---|---|
| 查询订购订单列表 | [`alibaba.app.pieceorder.get`](https://open.1688.com/api/apidocdetail.htm?id=cn.alibaba.open%3Aalibaba.app.pieceorder.get-1) |
| 查询应用在服务市场的订购订单 | [`app.order.get`](https://open.1688.com/api/apidocdetail.htm?id=cn.alibaba.open%3Aapp.order.get-1) |
| 查询应用近一个月到期订单 | [`app.expire.get`](https://open.1688.com/api/apidocdetail.htm?id=cn.alibaba.open%3Aapp.expire.get-1) |

### A.7 采购金支付（6）

| 用途 | 官方 API |
|---|---|
| 批量预充值支付咨询 | [`paycredit.batchFundCharge.decison`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Apaycredit.batchFundCharge.decison-1) |
| 批量预充值支付申请 | [`paycredit.batchFundCharge.apply`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Apaycredit.batchFundCharge.apply-1) |
| 预充值支付状态查询 | [`paycredit.batchFundCharge.status`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Apaycredit.batchFundCharge.status-1) |
| 采购金订单核销 | [`paycredit.orderVerification.pay`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Apaycredit.orderVerification.pay-1) |
| 预充值支付退款 | [`paycredit.fundCharge.refund`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Apaycredit.fundCharge.refund-1) |
| 预充值退款状态查询 | [`paycredit.refundCharge.status`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Apaycredit.refundCharge.status-1) |

### A.8 代发推单（11）

| 用途 | 官方 API |
|---|---|
| 创建代发单 | [`fenxiao.linkorder.add`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.add-1) |
| 批量创建代发单 | [`fenxiao.linkorder.batchAdd`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.batchAdd-1) |
| 查询合作供应商 | [`fenxiao.linkorder.getSupplierList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.getSupplierList-1) |
| 取消代发单 | [`fenxiao.linkorder.cancel`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.cancel-1) |
| 确认代发子单收货 | [`fenxiao.linkorder.confirmGoods`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.confirmGoods-1) |
| 给代发子单标记异常 | [`fenxiao.linkorder.addTags`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.addTags-1) |
| 查询代发单列表 | [`fenxiao.linkorder.getBuyerOrderList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.getBuyerOrderList-1) |
| 查询对账明细 | [`fenxiao.linkorder.getBuyerBillList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.getBuyerBillList-1) |
| 作废对账单 | [`fenxiao.linkorder.invalidBuyerBill`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.invalidBuyerBill-1) |
| 确认对账单 | [`fenxiao.linkorder.confirmBuyerBill`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.confirmBuyerBill-1) |
| 查询对账子单 | [`fenxiao.linkorder.getBuyerBillEntryList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.getBuyerBillEntryList-1) |

### A.9 代发推单—售后（5）

| 用途 | 官方 API |
|---|---|
| 查询售后单列表 | [`xiaodian.linkorder.getBuyerReverseOrderList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.xiaodian%3Axiaodian.linkorder.getBuyerReverseOrderList-1) |
| 创建售后单 | [`xiaodian.linkorder.createReverseOrder`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.xiaodian%3Axiaodian.linkorder.createReverseOrder-1) |
| 作废售后单 | [`xiaodian.linkorder.invalidReverseOrder`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.xiaodian%3Axiaodian.linkorder.invalidReverseOrder-1) |
| 上传退货信息 | [`xiaodian.linkorder.uploadReturnGoods`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.xiaodian%3Axiaodian.linkorder.uploadReturnGoods-1) |
| 更新货物状态 | [`xiaodian.linkorder.updateGoodsStatus`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.xiaodian%3Axiaodian.linkorder.updateGoodsStatus-1) |

### A.10 代发推单—对账（1）

| 用途 | 官方 API |
|---|---|
| 分销商发起对账 | [`xiaodian.linkorder.startDistributorBill`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.xiaodian%3Axiaodian.linkorder.startDistributorBill-1) |

### A.11 寻源（8）

| 用途 | 官方 API |
|---|---|
| 查询寻源需求列表 | [`fenxiao.sourcing.getSourcingRequisitionList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.getSourcingRequisitionList-1) |
| 创建换供寻源需求 | [`fenxiao.sourcing.createSourcingRequisition`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.createSourcingRequisition-1) |
| 创建主题寻源需求 | [`fenxiao.sourcing.createTopicRequisition`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.createTopicRequisition-1) |
| 查询寻源结果 | [`fenxiao.sourcing.getSourcingResultList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.getSourcingResultList-1) |
| 校验寻源需求 | [`fenxiao.sourcing.checkSourcingRequirement`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.checkSourcingRequirement-1) |
| 上报寻源结果操作 | [`fenxiao.sourcing.createSourcingOperation`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.createSourcingOperation-1) |
| 获取支持寻源类目 | [`fenxiao.sourcing.getHotCategorys`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.getHotCategorys-1) |
| 获取主题日历列表 | [`fenxiao.sourcing.getTopicCalendarList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.sourcing.getTopicCalendarList-1) |

### A.12 同款换供（5）

| 用途 | 官方 API |
|---|---|
| 开启需换供品池任务 | [`supply.recommendChangeOffer.startTask`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Asupply.recommendChangeOffer.startTask-1) |
| 终止通商/通品任务 | [`supply.task.stop`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Asupply.task.stop-1) |
| 分批拉取商品 ID | [`supply.offer.fetchIdList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Asupply.offer.fetchIdList-1) |
| 搜索分销同款换供/搭配推荐 | [`supply.similarOffer.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Asupply.similarOffer.search-1) |
| 站外批量同款图搜 | [`offer.similar.getList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aoffer.similar.getList-1) |

### A.13 选品（1）

| 用途 | 官方 API |
|---|---|
| 深度找 agent 选品 | [`open.agent.deepSearch`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.ai%3Aopen.agent.deepSearch-1) |

### A.14 换供 agent（5）

| 用途 | 官方 API |
|---|---|
| 换供 agent | [`open.agent.supplyChange`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.ai%3Aopen.agent.supplyChange-1) |
| 回流换供 agent 效果数据 | [`open.agent.supplyChangeDataFeedback`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.ai%3Aopen.agent.supplyChangeDataFeedback-1) |
| 添加商品/sku 换供监控 | [`fenxiao.supply.addMonitorProduct`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.supply.addMonitorProduct-1) |
| 删除商品/sku 换供监控 | [`fenxiao.supply.deleteMonitorProduct`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.supply.deleteMonitorProduct-1) |
| 查询监控商品列表 | [`fenxiao.supply.queryMonitorProductList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.supply.queryMonitorProductList-1) |

### A.15 点数扣减（4）

| 用途 | 官方 API |
|---|---|
| 查询当前授权用户点数 | [`fuwu.paybyamount.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fuwu%3Afuwu.paybyamount.get-1) |
| 发起实际扣减/冻结点数 | [`fuwu.paybyamount.startDeduct`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fuwu%3Afuwu.paybyamount.startDeduct-1) |
| 撤回预扣减/释放点数 | [`fuwu.paybyamount.rollbackDeduct`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fuwu%3Afuwu.paybyamount.rollbackDeduct-1) |
| 查询当前授权用户的服务市场订单 | [`service.order.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fuwu%3Aservice.order.get-1) |

### A.16 发票（8）

| 用途 | 官方 API |
|---|---|
| 分页查询买家发票抬头 | [`trade.invoiceTitle.getPageList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoiceTitle.getPageList-1) |
| 查询订单可开票金额 | [`trade.invoiceAmount.getList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoiceAmount.getList-1) |
| 分页查询买家发票申请 | [`trade.invoiceApply.getPageListBuyerView`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoiceApply.getPageListBuyerView-1) |
| 查询交易单关联发票 | [`trade.invoice.getListBuyerView`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoice.getListBuyerView-1) |
| 买家申请开票 | [`trade.invoice.apply`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoice.apply-1) |
| 新增发票抬头 | [`trade.invoiceTitle.add`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoiceTitle.add-1) |
| 合并开票咨询 | [`trade.invoice.consult`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoice.consult-1) |
| 提交合并开票 | [`trade.invoice.mergeapply`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.trade%3Atrade.invoice.mergeapply-1) |

## 附录 B：方案 8.5 全量在线消息（40 项）

工程建议按“消息可能重复或遗漏”设计幂等消费，并用相应查询 API 做补偿；官方方案页只列出消息名，不公开承诺投递语义，订阅与当前 AppKey 是否获权仍需在控制台确认。[清单数据源](https://open.1688.com/solution/data/getSolutionDetail.jsonp?solutionKey=1661754359978&callback=jsonp_doc)

### B.1 铺货商品（10）

| 触发/用途 | 官方消息 |
|---|---|
| 产品删除（关系用户视角） | [`PRODUCT_RELATION_VIEW_PRODUCT_DELETE`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_RELATION_VIEW_PRODUCT_DELETE) |
| 产品下架（关系用户视角） | [`PRODUCT_RELATION_VIEW_PRODUCT_EXPIRE`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_RELATION_VIEW_PRODUCT_EXPIRE) |
| 产品新增或修改（关系用户视角） | [`PRODUCT_RELATION_VIEW_PRODUCT_NEW_OR_MODIFY`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_RELATION_VIEW_PRODUCT_NEW_OR_MODIFY) |
| 产品上架（关系用户视角） | [`PRODUCT_RELATION_VIEW_PRODUCT_REPOST`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_RELATION_VIEW_PRODUCT_REPOST) |
| 商品库存变更（关系用户视角） | [`PRODUCT_PRODUCT_INVENTORY_CHANGE`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_PRODUCT_INVENTORY_CHANGE) |
| 分销商品铺货 | [`PRODUCT_FENXIAO_ADD_SUPPLY`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_FENXIAO_ADD_SUPPLY) |
| 商品任意变更动作（关系用户视角） | [`PRODUCT_RELATION_VIEW_PRODUCT_CHANGE`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_RELATION_VIEW_PRODUCT_CHANGE) |
| 产品审核（关系用户视角） | [`PRODUCT_RELATION_VIEW_PRODUCT_AUDIT`](https://open.1688.com/doc/topicDetail.htm?id=PRODUCT_RELATION_VIEW_PRODUCT_AUDIT) |
| 分销知识库 agentic 响应结果 | [`FENXIAO_DISTRIBUTION_KNOWLEDGE_AGENTIC_TOPIC`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_DISTRIBUTION_KNOWLEDGE_AGENTIC_TOPIC) |
| 严选金标商品变更 | [`FENXIAO_OFFER_YX_GOLDEN_40_CHANGE_TOPIC`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_OFFER_YX_GOLDEN_40_CHANGE_TOPIC) |

### B.2 下单（1）

| 触发/用途 | 官方消息 |
|---|---|
| 买家创建 1688 订单 | [`ORDER_BUYER_VIEW_BUYER_MAKE`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_BUYER_MAKE) |

### B.3 支付（2）

| 触发/用途 | 官方消息 |
|---|---|
| 订单批量支付状态同步 | [`ORDER_BATCH_PAY`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BATCH_PAY) |
| 买家视角交易付款 | [`ORDER_BUYER_VIEW_ORDER_PAY`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_PAY) |

### B.4 履约（7）

| 触发/用途 | 官方消息 |
|---|---|
| 买家视角订单改价 | [`ORDER_BUYER_VIEW_ORDER_PRICE_MODIFY`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_PRICE_MODIFY) |
| 买家视角订单发货 | [`ORDER_BUYER_VIEW_ANNOUNCE_SENDGOODS`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ANNOUNCE_SENDGOODS) |
| 买家视角交易成功 | [`ORDER_BUYER_VIEW_ORDER_SUCCESS`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_SUCCESS) |
| 买家视角物流轨迹状态变更 | [`LOGISTICS_BUYER_VIEW_TRACE`](https://open.1688.com/doc/topicDetail.htm?id=LOGISTICS_BUYER_VIEW_TRACE) |
| 物流单号修改 | [`LOGISTICS_MAIL_NO_CHANGE`](https://open.1688.com/doc/topicDetail.htm?id=LOGISTICS_MAIL_NO_CHANGE) |
| 买家视角订单部分发货 | [`ORDER_BUYER_VIEW_PART_PART_SENDGOODS`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_PART_PART_SENDGOODS) |
| 退货仓出仓通知 | [`LOGISTICS_OFFICIAL_WAREHOUSE_OUTBOUND`](https://open.1688.com/doc/topicDetail.htm?id=LOGISTICS_OFFICIAL_WAREHOUSE_OUTBOUND) |

### B.5 订单变更（8）

| 触发/用途 | 官方消息 |
|---|---|
| 商家修改订单地址（买家视角） | [`ORDER_BUYER_VIEW_ORDER_SELLER_MODIFY_ADRESS`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_SELLER_MODIFY_ADRESS) |
| 订单售中退款（买家视角） | [`ORDER_BUYER_VIEW_ORDER_BUYER_REFUND_IN_SALES`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_BUYER_REFUND_IN_SALES) |
| 订单售后退款（买家视角） | [`ORDER_BUYER_VIEW_ORDER_REFUND_AFTER_SALES`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_REFUND_AFTER_SALES) |
| 交易成功（买家视角） | [`ORDER_BUYER_VIEW_ORDER_SUCCESS`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_SUCCESS) |
| 买家关闭订单 | [`ORDER_BUYER_VIEW_ORDER_BUYER_CLOSE`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_BUYER_CLOSE) |
| 卖家关闭订单 | [`ORDER_BUYER_VIEW_ORDER_SELLER_CLOSE`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_SELLER_CLOSE) |
| 确认收货 | [`ORDER_BUYER_VIEW_ORDER_COMFIRM_RECEIVEGOODS`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_COMFIRM_RECEIVEGOODS) |
| 运营后台关闭订单 | [`ORDER_BUYER_VIEW_ORDER_BOPS_CLOSE`](https://open.1688.com/doc/topicDetail.htm?id=ORDER_BUYER_VIEW_ORDER_BOPS_CLOSE) |

### B.6 采购金支付（2）

| 触发/用途 | 官方消息 |
|---|---|
| 采购金预充值支付结果 | [`FENXIAO_PAY_CREDIT_FUND_CHARGE_RESULT`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_PAY_CREDIT_FUND_CHARGE_RESULT) |
| 采购金退款结果 | [`FENXIAO_PAY_CREDIT_FUND_CHARGE_REFUND_RESULT`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_PAY_CREDIT_FUND_CHARGE_REFUND_RESULT) |

### B.7 分销（7）

| 触发/用途 | 官方消息 |
|---|---|
| 分销商品变更 | [`FENXIAO_OFFER_CHANGE`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_OFFER_CHANGE) |
| 分销价格变更 | [`FENXIAO_PRICE_CHANGE`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_PRICE_CHANGE) |
| 代发推单对账单状态变更（买家视角） | [`FENXIAO_BUYER_VIEW_LINK_ORDER_BILL`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_BUYER_VIEW_LINK_ORDER_BILL) |
| 代发子单状态变更（买家视角） | [`FENXIAO_BUYER_VIEW_LINK_ORDER_ENTRY_TOPIC`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_BUYER_VIEW_LINK_ORDER_ENTRY_TOPIC) |
| 代发主单状态变更（买家视角） | [`FENXIAO_BUYER_VIEW_LINK_ORDER_TOPIC`](https://open.1688.com/doc/topicDetail.htm?id=FENXIAO_BUYER_VIEW_LINK_ORDER_TOPIC) |
| 代发售后货物状态变更（买家视角） | [`XIAODIAN_BUYER_VIEW_REVERSE_ORDER_GOODS_STATUS_CHANGE`](https://open.1688.com/doc/topicDetail.htm?id=XIAODIAN_BUYER_VIEW_REVERSE_ORDER_GOODS_STATUS_CHANGE) |
| 代发售后状态变更（买家视角） | [`XIAODIAN_BUYER_VIEW_REVERSE_ORDER_STATUS_CHANGE`](https://open.1688.com/doc/topicDetail.htm?id=XIAODIAN_BUYER_VIEW_REVERSE_ORDER_STATUS_CHANGE) |

### B.8 授权（2）

| 触发/用途 | 官方消息 |
|---|---|
| 用户取消授权 | [`AUTHORIZATION_CANCEL`](https://open.1688.com/doc/topicDetail.htm?id=AUTHORIZATION_CANCEL) |
| 用户授权成功 | [`AUTHORIZATION_SUCCESS`](https://open.1688.com/doc/topicDetail.htm?id=AUTHORIZATION_SUCCESS) |

### B.9 换供 agent（1）

| 触发/用途 | 官方消息 |
|---|---|
| 换供智能推荐 | [`AGENT_SUPPLY_CHANGE_RECOMMEND`](https://open.1688.com/doc/topicDetail.htm?id=AGENT_SUPPLY_CHANGE_RECOMMEND) |

## 附录 C：官方变更日志（29 条）

以下是方案详情响应中自 2025-02-18 起的全部变更记录；当前数据没有任何 `removedApis` 或 `removedMessages`。这只描述方案变化，不代表 AppKey 自动获得新增项。[变更日志数据源](https://open.1688.com/solution/data/getSolutionDetail.jsonp?solutionKey=1661754359978&callback=jsonp_doc)

| 时间 | 新增 API | 新增消息 |
|---|---|---|
| 2026-08-26 | `repurchase.contract.get` | — |
| 2026-08-21 | `trade.invoice.mergeapply`、`trade.invoice.consult`、`qycg.selfOpItem.getList` | — |
| 2026-08-12 | `alibaba.jsls.syncSelectionLinkRel` | — |
| 2026-07-23 | `warehouse.order.outbound` | `LOGISTICS_OFFICIAL_WAREHOUSE_OUTBOUND` |
| 2026-07-22 | `alibaba.jsls.syncTenant`、`alibaba.jsls.syncSupplyData` | — |
| 2026-07-02 | `alibaba.jsls.yxQuery` | `FENXIAO_OFFER_YX_GOLDEN_40_CHANGE_TOPIC` |
| 2026-04-20 | `alibaba.trade.getMaxRefundFee` | — |
| 2026-04-15 | `trade.invoiceTitle.add` | — |
| 2026-04-07 | `fenxiao.supply.deleteMonitorProduct`、`trade.invoice.getListBuyerView`、`fenxiao.supply.addMonitorProduct`、`trade.invoiceApply.getPageListBuyerView`、`fenxiao.supply.queryMonitorProductList`、`fenxiao.support.queryKnowledge`、`trade.invoiceAmount.getList`、`trade.invoiceTitle.getPageList`、`trade.invoice.apply` | `FENXIAO_DISTRIBUTION_KNOWLEDGE_AGENTIC_TOPIC` |
| 2026-03-20 | `refund.address.get` | — |
| 2026-03-16 | `ciphertext.weixin.getShopId` | — |
| 2026-02-10 | `service.order.get` | — |
| 2026-01-28 | `fuwu.paybyamount.rollbackDeduct`、`fuwu.paybyamount.startDeduct`、`fuwu.paybyamount.get` | — |
| 2026-01-26 | `fenxiao.hitlab.queryHitLabBatch` | — |
| 2026-01-23 | `fenxiao.hitlab.queryHitLabItem`、`fenxiao.aimaterial.getDetail` | — |
| 2026-01-16 | `alibaba.trade.OpQueryMarketingMixConfig` | — |
| 2026-01-08 | `fenxiao.brand.queryAuth` | — |
| 2025-12-19 | `open.agent.supplyChangeDataFeedback`、`open.agent.supplyChange` | `AGENT_SUPPLY_CHANGE_RECOMMEND` |
| 2025-12-12 | `offer.similar.getList` | — |
| 2025-11-26 | `open.agent.deepSearch` | — |
| 2025-11-25 | `trade.track.getSummary` | — |
| 2025-11-20 | `fenxiao.risk.queryGoodsRisk` | — |
| 2025-11-06 | `fenxiao.warehouse.syncWarehouseAddress` | — |
| 2025-08-15 | `supply.recommendChangeOffer.startTask`、`supply.similarOffer.search`、`supply.task.stop`、`supply.offer.fetchIdList` | — |
| 2025-06-06 | `alibaba.trade.modifyRefund` | — |
| 2025-05-20 | `alibaba.logistics.OpQueryLogisticCompanyList` | — |
| 2025-05-07 | `fenxiao.warehouse.checkWarehouseOpenStatus`、`fenxiao.warehouse.queryOrderDetail`、`fenxiao.warehouse.createOrder`、`fenxiao.warehouse.queryWarehouseList` | — |
| 2025-03-07 | `buyer.outshop.feedback` | — |
| 2025-02-18 | `fenxiao.order.createReverseOrder` | — |

方案“最近更新”正文另列出 2023-12-19 采购金方案及 2025-05-07 至 2026-01-07 的摘要，但它不是当前在线 API 清单；当正文、变更日志和在线清单不一致时，应以当前 `onlineApiModules`/`onlineModules` 加上控制台实际获权为准。[方案最近更新](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978#recentUpdate)
