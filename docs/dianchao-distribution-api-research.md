# 电潮分销 V1：1688 导入与微信小店铺货官方接口研究

> 核对日期：2026-08-28  
> 范围：只使用 1688/阿里巴巴开放平台、微信开放文档、阿里云 SAE 官方资料。本文不包含实现代码。  
> 状态标记：**已明确**＝官方页面直接写明；**需实测**＝方案页列有该能力，但当前 AppKey 是否获权仍须控制台验证；**需平台确认**＝公开资料没有足够信息。
>
> 控制台核验更新：已在“电潮分销”当前 AppKey `3255489` 的 API 测试工具确认商品详情、两种关键词搜索、类目、叶子类目属性和授权用户信息接口可选；尚未使用客户授权 Token 发起真实调用。

## 一、先给结论

1. **1688 主链路可行，但不能把“方案接口清单”当成“当前 AppKey 权限清单”。**“代发解决方案（服务商版）”当前页面为 **8.5 版、更新于 2026-08-27**，定位为软件开发商给下游买家提供站外采购工具，官方方案包含商品铺货、订单自动回流等能力，并要求服务市场类目选择“场景对接-买家场景-采购工具”。方案页列有商品详情、关键词搜索、图搜、类目和属性等接口；当前 AppKey 是否全部开通，只能在控制台“已获取能力”及 API 测试工具中逐个确认。[1688 代发解决方案（服务商版）](https://open.1688.com/solution/solutionDetail.htm?solutionKey=1661754359978)
2. **V1 最稳的 1688 导入入口是 `offerId → alibaba.fenxiao.productInfo.get`。**该接口明确要求用户 `access_token`，并要求 `offerId` 与 `openOfferID` 二选一。搜索、图搜、AI 选品应作为辅助入口，不能替代按商品 ID 获取详情。[获取分销商品详情接口](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.productInfo.get-1)
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
| 按 ID 获取商品详情 | [`alibaba.fenxiao.productInfo.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.productInfo.get-1) | 要求用户 `access_token`；`offerId`、加密 `openOfferID` 二选一。作为 V1 导入标题、价格、SKU、图片、详情等信息的主入口。 | **当前 AppKey 已可选，待授权调用** |
| 国内分销关键词搜索 | [`product.keywords.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aproduct.keywords.search-1) | 要求用户 token。官方页说明其选品池标签包含 454466（现货、48小时、一件代发包邮、7天无理由退换）和 454658（严选优质品等），`filter` 为空或标签无效时返回两个标签全集。不能理解为全站任意商品搜索。 | **当前 AppKey 已可选，待授权调用** |
| 商品关键词搜索 | [`product.keyword.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aproduct.keyword.search-1) | 方案页同时列出。与“国内分销词搜”的数据池、字段和准入并不相同，V1 应分别用真实 token 测试，不应混成一个接口。 | **当前 AppKey 已可选，待授权调用** |
| 图搜内贸代发商品 | [`alibaba.public.image.similar.offer.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.public.image.similar.offer.search-1) | 用于以图片寻找内贸代发商品。V1 可后置，不是 offerId 导入的前置依赖。 | **需实测** |
| 查询类目 | [`alibaba.category.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.category.get-1) | 按类目 ID 查询 1688 类目信息，用于构造 1688→内部→微信类目映射。 | **当前 AppKey 已可选，待授权调用** |
| 叶子类目属性 | [`alibaba.category.attribute.get`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.category.attribute.get-1) | 获取叶子类目属性；不能直接当作微信小店属性，仍需做平台间映射。 | **当前 AppKey 已可选，待授权调用** |
| AI 深度选品 | [`open.agent.deepSearch`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.ai%3Aopen.agent.deepSearch-1) | 方案页当前列入“选品”。它不是一个稳定的“通用推荐列表”替代品，应作为独立增值能力验证配额、输入和返回稳定性。 | **需实测/可能额外准入** |
| 同款/换供 | [`supply.similarOffer.search`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Asupply.similarOffer.search-1)、[`offer.similar.getList`](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aoffer.similar.getList-1) | 面向换供和同款检索，不等于普通商品推荐；建议放到 V1 之后。 | **需实测/可能额外准入** |

### 2.3 图片处理边界

- 1688 方案页的商品主链路是“商品详情返回图片/详情素材”，没有把单独“1688 图片上传接口”列为云库导入的必要步骤。V1 应保存原始图片 URL/原始响应快照，并建立可编辑副本；不要覆盖原始数据。
- 铺货到微信时不能假定 1688 图片 URL 可直接长期使用，应通过微信的[上传图片接口](https://developers.weixin.qq.com/doc/store/shop/API/apimgnt/resource/api_img_upload.html)上传到微信侧，取得可供后续接口使用的媒体标识。
- 1688 方案页明确要求接口返回数据合理合规，禁止利用开放数据进行不正当竞争或相关推荐。图片二次存储、裁剪、去水印、跨客户共享和对外展示的授权范围，公开方案页没有给出完整许可，属于**需平台/商品权利人确认**；V1 不应默认拥有图片著作权或去水印权。[1688 代发服务商方案的数据使用规范](https://open.1688.com/solution/solutionDetail.htm?solutionKey=1661754359978#solutionDesc)

### 2.4 “方案接口清单”与“AppKey 实际权限”必须分开

公开方案页面仍不能证明某个 AppKey 已实际获权；本项目已经进一步在 AppKey `3255489` 的 API 测试工具确认核心接口可选。开发前及联调时继续完成带结果的验收表：

1. 打开“能力管理—已获取能力”，逐个核对接口名。
2. 在 API 测试工具中使用测试授权账号调用；记录“成功、无权限、参数错误、配额不足”四类结果。
3. 优先验证 `alibaba.fenxiao.productInfo.get`、`product.keywords.search`、`alibaba.category.get`、`alibaba.category.attribute.get`。
4. 搜索、图搜、AI、换供若未获权，不阻塞 offerId 导入 V1；商品详情若未获权则直接阻塞 V1。

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
