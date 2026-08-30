# 1688 搜货能力与官方 API 调研

> 调研范围：1688 开放平台「代发解决方案（服务商版）」8.5 及仓库现状。本文只采用 1688/阿里巴巴官方开放平台页面、官方公开元数据和本仓库源码作为事实依据；未暴露或记录 AppSecret、access token 等凭证。

## 结论摘要

| 用户能力 | 官方 API / 实现方式 | 结论 |
| --- | --- | --- |
| 关键词搜货 | `com.alibaba.fenxiao:product.keywords.search-1` | 可实施，但必须先确认 AppKey 已取得该能力并完成用户 OAuth 授权 |
| 通用商品关键词搜索 | `com.alibaba.product:product.keyword.search-1` | 可实施的另一接口；返回模型与分销词搜不同，不应混用 |
| 上传图片搜货 | `com.alibaba.product:alibaba.public.image.similar.offer.search-1` 的 `imgBase64` | 可实施；公开限制为单图 Base64、最大 3 MB，最多返回 10 条 |
| 图片 URL 搜货 | 同一图搜 API 的 `imgUrl` | 可实施；不是另一个上传接口 |
| 商品链接 / Offer ID | 本地解析数字 ID，再调用 `alibaba.fenxiao.productInfo.get-1` | 可实施，仓库已有主要链路 |
| 店铺链接 / 供应商商品搜索 | 当前方案中没有确认到“任意店铺链接 → 店内商品”的公开 API | 当前不可直接实现；`getSupplierList` 不能替代 |
| 低价货源推荐 | `product.keywords.search` 的严选池/低价标签最接近 | 可做“严选低价货源”，不能宣称全网绝对最低价 |
| 同款换供 / 搭配推荐 | `supply.similarOffer.search-1`、`offer.similar.getList-1` | 需要源商品或下游平台场景，不是通用低价推荐；可能还需额外业务准入 |
| AI 深度找货 | `com.alibaba.ai:open.agent.deepSearch-1` | 流式 AI/增值能力，不能当作普通分页关键词接口；需单独确认准入 |

所有下列目标 API 的官方公开元数据均标识 `needAuth=true`、`needSignature=true`。因此，API 出现在解决方案页面不等于当前 AppKey 已实际获权；上线前仍须在开放平台“已获取能力”中核对，并用完成 OAuth 授权的用户 token 做真实调用验证。

## 1. 官方调用与授权规则

开放平台 API 的调用路径为：

```text
POST https://gw.open.1688.com/openapi/param2/{version}/{namespace}/{apiName}/{appKey}
Content-Type: application/x-www-form-urlencoded
```

本调研涉及的 API 均应使用签名后的表单 POST，并携带代表授权用户的 `access_token`。签名、OAuth 和 token 生命周期应按官方文档实现，不能把 AppSecret 或 token 放在前端、日志、健康接口或仓库文档中。

官方参考：

- [API 调用说明](https://open.1688.com/doc/apiInvoke.htm)
- [签名规则](https://open.1688.com/doc/signature.htm)
- [API 授权说明](https://open.1688.com/doc/apiAuth.htm)
- [代发解决方案（服务商版）页面](https://open.1688.com/develop/solution/detail?solutionKey=1661754359978)

公开 API 元数据可通过以下官方地址核对，本文的参数和返回字段均以这些数据为准：

```text
https://open.1688.com/api/data/getApiDetail.json?namespace={namespace}&name={apiName}&version=1&_input_charset=UTF-8
https://open.1688.com/api/data/getModelInfo.json?apiname={apiName}&namespace={namespace}&type={1|2}&version=1&typeName={typeName}&_input_charset=UTF-8
```

## 2. 关键词搜货

### 2.1 国内分销词搜（建议作为电潮分销的默认关键词入口）

- 正式 API：`com.alibaba.fenxiao:product.keywords.search-1`
- 调用方式：开放平台签名表单 `POST`
- 权限：用户授权 + 签名；必须确认当前 AppKey 已获取该能力
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aproduct.keywords.search-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.fenxiao&name=product.keywords.search&version=1&_input_charset=UTF-8)

请求参数是必填包装对象 `param: FenXiaoKeyWordSearchParam`，主要字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `keywords` | String | 搜索关键词 |
| `categoryIds` | String[] | 类目 ID 列表 |
| `pageNum` | Long | 页码 |
| `pageSize` | Long | 默认 20，最大 50 |
| `priceStart` / `priceEnd` | String | 价格区间，单位元 |
| `quantityBegin` | Long | 最小起批量 |
| `filter` | String[] | 官方筛选标签；当前元数据含 `fxBrandOffer`、`hasAIMaterials`、`YX_SCORE_LEVEL_1/2` 等 |

官方页面的示例说明还列出严选池筛选编码 `454466` 和 `454658`。其中 `454658` 的描述包含“趋势爆款、全网低价、现货、48 小时发货、一件包邮、7 天无理由”等组合标签。这里的“全网低价”是官方精选池/标签语义，不等价于对所有 1688 商品进行实时全网比价，更不能作为“绝对最低价”承诺。需要注意，同一官方页面的当前复杂类型字段说明列出的是 `fxBrandOffer`、`hasAIMaterials`、`YX_SCORE_LEVEL_1/2`，与示例中的数字池编码并不完全一致；数字编码必须在线实测后才能固化。

返回 `PageResultModel`，核心结构：

- `success`、`code`、`message`
- `result: FenXiaoSearchOfferModel[]`
- `pageInfo`: `currentPage`、`pageSize`、`totalPage`、`totalRecords`

商品结果可包含 `offerId`、`subject`、`offerImage`、`offerPrice`、`companyInfo`、`loginId`、`userId`、`openUid`、历史交易信息、交易服务信息、质量评价和严选星级等。

### 2.2 商品关键词搜索接口（另一套模型）

- 正式 API：`com.alibaba.product:product.keyword.search-1`
- 调用方式：开放平台签名表单 `POST`
- 权限：用户授权 + 签名
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aproduct.keyword.search-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.product&name=product.keyword.search&version=1&_input_charset=UTF-8)

请求对象为 `OpenKeywordsSearchParam`。当前复杂类型元数据确认的字段包括：必填 `keywords`，以及 `categoryIds`、`quantityBegin`、`priceStart`、`priceEnd`、`filter`、`pageSize`、`pageNum`。官方示例筛选值包括 `shipIn48Hours`、`freeExchange7days`、`powerMerchant`、`crossPotential`、`ttpft`、`jxhy`、`YX_SCORE_LEVEL_1/2`。

该 API 的顶层参数示例还出现了 `sortType: "price"` 和 `sortOrder`，但当前 `OpenKeywordsSearchParam` 字段元数据没有列出这两个字段。两份官方元数据彼此不一致，因此不能把价格排序作为已确认契约；接入前必须用在线测试工具验证，失败时应在服务端对当前页结果排序，并明确这不是全站最低价排序。

返回 `alibaba.openapi.shared.productkeywordsearch.PageResultModel`，商品标识中可包含加密的 `openOfferId`。它与“国内分销词搜”的请求/返回模型不同，接入时应分别建模。公开元数据描述中出现“实现商品图搜”的字样，但 API 名称、参数和模型均为关键词搜索；这是官方页面内部的不一致，不能据此把该接口当作图搜接口。

## 3. 图片搜货

- 正式 API：`com.alibaba.product:alibaba.public.image.similar.offer.search-1`
- 展示名称：图搜内贸代发商品
- 调用方式：开放平台签名表单 `POST`
- 权限：用户授权 + 签名
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.product%3Aalibaba.public.image.similar.offer.search-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.product&name=alibaba.public.image.similar.offer.search&version=1&_input_charset=UTF-8)
- [官方结果模型 `ImageOfferSearchResult`](https://open.1688.com/api/data/getModelInfo.json?apiname=alibaba.public.image.similar.offer.search&namespace=com.alibaba.product&type=2&version=1&typeName=ImageOfferSearchResult&_input_charset=UTF-8)

上传图片和图片 URL 是同一个 API 的两种入参：

| 字段 | 说明 |
| --- | --- |
| `imgBase64` | 单张图片的 Base64；官方公开限制为不超过 3 MB |
| `imgUrl` | 可访问的图片 URL |
| `imageKeywords` | 可选的图片关键词 |
| `filter` | 可选严选星级，如 `YX_SCORE_LEVEL_1/2` |
| `priceStart` / `priceEnd` | 可选价格区间 |

元数据把 `imgBase64`、`imgUrl` 分别标为可选，但真实请求显然需要图像来源。实现应要求二者至少一个，并在两者同时出现时选择明确的优先级或拒绝歧义输入；该约束仍需以真实调用验证。

返回包括 `success`、`code`、`message`、`imageSearchUrl`、`imageSearchResult` 和 `extraInfo`。`imageSearchResult` 官方限定最多 10 条；每条可含：

- `offerId`、`detailUrl`、`subject`、`image`
- `price`、`fenxiaoPrice`、`consignPrice`、`multipleConsignPrice`
- `tags`、`isJxhy`、`jyFlag`、`distributionFreePostage`、`yxScoreLevel`

公开元数据没有排序参数。因此，下列产品行为不能由该公开 API 直接确认：多图联合搜索、5 MB 上传限制、返回超过 10 条、图片质量分、按价格排序或保证最低价。这些如出现在竞品页面，只能视为竞品层行为、私有接口或多接口组合，不能写成 1688 公开图搜能力。

## 4. 商品链接与 Offer ID

- 正式 API：`com.alibaba.fenxiao:alibaba.fenxiao.productInfo.get-1`
- 调用方式：开放平台签名表单 `POST`
- 权限：用户授权 + 签名
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aalibaba.fenxiao.productInfo.get-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.fenxiao&name=alibaba.fenxiao.productInfo.get&version=1&_input_charset=UTF-8)

主要参数：

- `offerId: Long` 或 `openOfferId: String`，二选一
- `tenantId` 仅用于特定下游业务场景，普通导入不应擅自填写

返回 `success`、`errorCode`、`errorMsg`、`productInfo`。

该 API 接受商品标识，不接受任意商品 URL。正确链路是：

1. 在本地校验并解析用户输入的 Offer ID 或 1688 商品链接；
2. 提取 `offerId`；
3. 调用 `productInfo.get` 获取正式商品详情。

仓库 [`src/domain/offer-id.ts`](../src/domain/offer-id.ts) 已支持：

- 6–30 位纯数字 ID；
- `1688.com/offer/{id}.html`；
- 1688 域名 URL 中的 `offerId` 或 `id` 查询参数。

它会拒绝非 1688 域名。未直接暴露数字 ID 的手机分享链接、短链接或多次跳转链接目前不能稳定解析；若以后要支持，应另做严格域名白名单的重定向解析，不能把它误称为 `productInfo.get` 的能力。

## 5. 店铺链接与供应商商品搜索

当前解决方案中可确认的供应商接口是：

- `com.alibaba.fenxiao:fenxiao.linkorder.getSupplierList-1`
- 展示名称：分销商查询合作的供应商列表
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Afenxiao.linkorder.getSupplierList-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.fenxiao&name=fenxiao.linkorder.getSupplierList&version=1&_input_charset=UTF-8)

它使用 `DistributorApplyQueryRequest` 分页查询当前分销商已经合作的供应商，服务于关联下单流程。它不是：

- 任意 1688 店铺链接解析器；
- 全站供应商搜索；
- 按店铺查询全部商品；
- 店铺 URL 转供应商 ID 的接口。

请求对象只有 `pageNum`、`pageSize` 和可选的 `supplierLoginId`；没有店铺 URL、类目、关键词或商品分页参数。返回是合作申请分页结果，核心字段为 `supplierLoginId`、`supplierCompanyName`、`coopStatus`、`coopTime`、`settleMethod` 以及分页/错误信息，也不含供应商商品列表。

因此，现有“店铺链接/供应商商品搜索”不能用 `getSupplierList` 冒充实现。除非开放平台另行授予并明确文档化店铺商品能力，否则前端应保持不可用，或把功能重新定义为“选择已合作供应商”。

## 6. 低价货源、同款与 AI 推荐

### 6.1 可落地的“严选低价货源”

最稳妥的公开实现是调用 `product.keywords.search`，使用官方严选池/低价相关筛选，再在返回结果允许的字段范围内进行产品侧展示。命名应使用“严选低价货源”“低价标签货源”等克制表述，不应承诺“全网最低”“实时比价最低”。

图搜接口虽然返回多个价格字段，但最多 10 条且没有公开排序参数。应用可以对已返回的 10 条做本地排序，但这只能表示“当前返回集合中的较低价”，不能表示全平台最低价。

### 6.2 分销同款换供 / 搭配推荐

- 正式 API：`com.alibaba.fenxiao:supply.similarOffer.search-1`
- 展示名称：分销同款换供
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Asupply.similarOffer.search-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.fenxiao&name=supply.similarOffer.search&version=1&_input_charset=UTF-8)

该接口提供“同款换供 & 搭配推荐”，但必填 `platform`、`platformItemId`、`scene`（1 同款换供、2 搭配推荐、3 两者），并可带 `imgBase64`、`imgUrl`、`keywords`、`originalItemId`。返回最多 20 条 `itemSearchResult` 和 `usedModel`。

它要求下游平台商品上下文，不是输入一个关键词就返回便宜商品的通用推荐 API；真实可用性还应确认场景/业务准入。

### 6.3 同款批量返回

- 正式 API：`com.alibaba.fenxiao:offer.similar.getList-1`
- 展示名称：同款图搜支持站外批量返回
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.fenxiao%3Aoffer.similar.getList-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.fenxiao&name=offer.similar.getList&version=1&_input_charset=UTF-8)

它需要 `SimilarSearchParam`。当前官方模型把 `originImgUrl`、`originItemId`、`originSkuId`、`originSkuTitle`、`icTagCodes`、`tcTagCodes` 都标为必填，说明它依赖源商品、SKU、图片和标签上下文。

返回为 `success`、`data`、`message`、`errorCode`、`traceId`；`data.similarOfferModels` 的公开字段主要是 `simOfferId`、`simSkuId`、`simSource` 和扩展 JSON。公开模型没有正式价格字段，因此它只能作为“已有商品 → 找同款”的候选标识接口，不能单独承担低价推荐；需要再用商品详情接口补全并比较价格。

### 6.4 AI 深度找货

- 正式 API：`com.alibaba.ai:open.agent.deepSearch-1`
- 展示名称：深度找 agent
- [官方 API 文档](https://open.1688.com/api/apidocdetail.htm?id=com.alibaba.ai%3Aopen.agent.deepSearch-1)
- [官方 API 元数据](https://open.1688.com/api/data/getApiDetail.json?namespace=com.alibaba.ai&name=open.agent.deepSearch&version=1&_input_charset=UTF-8)

`query` 必填，`filterProcess` 可选，返回为流式 `InputStream`。这是 AI/增值/流式能力，接入方式与普通 JSON 分页 API 不同；必须单独确认能力授权和业务准入，也不应替代稳定的关键词搜索主链路。

## 7. 仓库现状与缺口

经源码核对：

- [`src/connectors/alibaba1688/connector.ts`](../src/connectors/alibaba1688/connector.ts) 当前连接器接口只暴露 `getProductInfo`。
- [`src/connectors/alibaba1688/real-connector.ts`](../src/connectors/alibaba1688/real-connector.ts) 只调用 `alibaba.fenxiao.productInfo.get`。
- [`src/connectors/alibaba1688/api-client.ts`](../src/connectors/alibaba1688/api-client.ts) 已具备通用签名表单 POST 基础，可复用到关键词和图搜，但需要分别建模、校验和测试。
- [`src/domain/offer-id.ts`](../src/domain/offer-id.ts) 已有商品 ID/链接的本地解析。
- [`src/web/pages.tsx`](../src/web/pages.tsx) 的关键词搜索目前只是过滤本地已导入商品；`image`、`imageUrl`、`store` 模式被禁用；推荐页也只是筛选/排序本地商品。

因此，当前 UI 中的“关键词搜货”“图片搜货”“低价货源推荐”还不能被描述为已接通 1688 官方搜索。硬编码榜单/品牌 URL 或本地排序也不能被当成官方 API 结果。

### 7.1 竞品界面字段与公开 API 的对应边界

竞品截图仅用于提出待核对需求，不作为 1688 官方能力证据。按上述官方模型，能确认或可能通过公开接口组合得到的范围如下：

| 竞品界面行为/字段 | 官方公开能力核对 |
| --- | --- |
| 图片缩略图、商品标题、详情链接、代发价格、精选/严选标记、服务标签 | 图搜结果直接提供 `image`、`subject`、`detailUrl`、价格字段、`isJxhy`、`jyFlag`、`yxScoreLevel`、`tags` |
| 店铺名称/地址、复购率、质量综合分、历史交易、交易服务 | 两套关键词搜索的结果模型分别提供 `companyInfo`、`qualityEvaluation`、`offerHistoryTradeInfo`、`offerTradeServiceInfo`；不能假设图搜单次响应也包含这些字段，需要以 `offerId` 继续查详情或组合其他已获权接口 |
| 密文面单支持平台 | `productInfo.get` 的公开商品模型含 `encryptLogisticsOrderSupportChannel`，但需要逐商品补查；不能视为图搜结果的直接字段 |
| “近 30 天品质退款率”“近 30 天 24 小时揽收率”等精确数值 | 当前图搜、两套关键词搜索及商品详情的公开字段中未确认到同名数值契约，不能照抄竞品展示；可能来自私有能力、扩展字段或其他接口组合 |
| 一次上传最多 10 张、单张不超过 5 MB | 当前公开图搜只确认一个 `imgBase64` 或一个 `imgUrl`，Base64 图片不超过 3 MB；不能把竞品前端限制当作开放 API 限制 |
| 综合/代发销量/代发价格排序 | 图搜公开参数没有排序字段；通用关键词接口仅在示例中出现价格排序而正式复杂类型字段未列出。需要在线实测或仅对当前返回集合本地排序 |

因此，第一阶段可以还原“单图/图片 URL → 最多 10 个基础商品候选 → 按 Offer ID 补详情”的公开链路；多图批量、5 MB、完整店铺指标和服务端多维排序不能在没有额外正式 API/权限证据时承诺。

## 8. 建议实施顺序

1. **保持商品链接/Offer ID 导入主链路**：继续使用本地解析 + `productInfo.get`，补齐短链边界提示。
2. **先接分销关键词搜索**：新增独立请求/响应模型、分页和错误映射；部署前用已授权 token 做一次真实调用。
3. **再接单图搜索**：服务端限制单图 3 MB，支持 Base64 或 URL 二选一，并明确最多 10 条、无官方排序参数。
4. **低价页改为严选标签语义**：以 `product.keywords.search` 的官方池/标签为数据源；不要承诺绝对最低价。
5. **店铺链接继续禁用**：除非获得新的官方店铺商品 API 和实际权限。
6. **同款换供、AI 深搜单独立项**：确认场景准入、授权、限流、计费和流式处理后再做，不与普通搜货混在一起。

## 9. 上线前必须实测的未确认项

- 当前 AppKey 是否实际获授每个目标 API，而不只是解决方案页面可见；
- OAuth 用户范围、token 过期/刷新和不同 1688 账号的结果差异；
- 图搜在 `imgBase64` 与 `imgUrl` 均缺失或同时存在时的实际错误行为；
- 严选池筛选编码在当前应用权限下的实际可用性和空结果行为；
- 每个接口的真实限流、错误码、数据脱敏和返回字段缺省情况；
- `supply.similarOffer.search`、`offer.similar.getList`、`deepSearch` 是否需要额外业务审核、计费或场景白名单。

这些项目只能通过当前应用的官方能力页和安全的授权实测确认，公开元数据不足以推断。
