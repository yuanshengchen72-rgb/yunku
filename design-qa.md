# Design QA

## 既有四页复刻 QA（保留）

- 参考范围：链接铺货、货源推荐、货源搜索、铺货记录四张源图。
- 实现证据：`qa/link-implementation-final.png`、`qa/recommend-implementation-final.png`、`qa/search-implementation-final.png`、`qa/search-dialog-implementation-final.png`、`qa/records-implementation-final.png`。
- 四页源图与既有实现均按 1718×1296、DPR 1 检查；此前已修复推荐页两列降级、导航焦点框、搜索批量态弹窗、铺货记录列名和开发会话失效重复报错。
- 既有结论：四页整体网格、双层头部、240px 左栏、内容卡片、橙色主操作、搜索展开态和记录表结构达到目标；品牌与真实数据差异为有意保留。

## 本轮搜索页视觉与交互 QA

## 对照范围

- 参考：`artifacts/design-qa/reference-xiaofeng-keyword.png`
- 参考：`artifacts/design-qa/reference-xiaofeng-image.png`
- 参考：`artifacts/design-qa/reference-xiaofeng-results.png`
- 实现：`artifacts/design-qa/implementation-search-keyword-batch-final.png`
- 实现：`artifacts/design-qa/implementation-search-image-revised.png`
- 实现：`artifacts/design-qa/implementation-search-results-final.png`
- 同屏对照：`artifacts/design-qa/comparison-keyword-batch.png`
- 同屏对照：`artifacts/design-qa/comparison-image.png`
- 同屏对照：`artifacts/design-qa/comparison-results.png`

参考图包含 Edge 浏览器工具栏，比较时裁掉顶部 164px，只保留 1688 应用容器。实现图以 1265×712 桌面视口截取；完整视图与搜索核心区域均已在同一张对照图中检查。

## 对照结果

- 信息层级：1688 一件代发标题、五种搜索入口、主搜索框、批量入口、上传/批量面板和结果筛选层级与参考一致。
- 布局：左侧铺货导航、顶部平台导航、居中的搜索工作区和结果区均无重叠、裁切或不可见主操作；1265×712 下批量“确定/取消”按钮可见。
- 视觉：主操作统一为 1688 橙色；浅灰面板、细边框、留白和圆角与参考保持同一视觉语言。电潮分销品牌标识保留现有蓝橙资产，不复制晓风商标。
- 交互：关键词、图片/图片链接、商品链接、批量输入、筛选、排序、分页和“立即铺货”主路径均绑定真实接口或现有业务接口；没有用静态假按钮冒充能力。
- 内容：上传上限显示为 3MB，这是 1688 官方公开相似图接口的真实限制；参考中的 5MB 文案未照搬。任意店铺链接搜索没有已确认公开 API，因此明确提示暂不可用，不返回模拟结果。
- 可访问性：输入框有可见标签/占位，文件选择有可点击标签，按钮使用语义化控件；键盘聚焦状态可见。

## 修正记录

1. 首轮发现搜索与确认按钮颜色偏蓝、结果前提前显示筛选面板、批量操作按钮在小视口首屏下方。
2. 将主操作改为 1688 橙色，筛选面板改为搜索后显示，并将批量文本区改为响应式高度。
3. 二次同屏检查未发现 P0、P1 或 P2 级视觉/交互问题。

## 已知边界

- 参考结果页包含晓风私有/组合指标；电潮只展示已由官方接口确认并能实际执行的筛选项。
- 本地开发模式会返回明确标记的模拟商品用于联调；生产 `real` 连接器调用 1688 官方 API，不会用模拟数据填充搜索结果。
- 浏览器中已验证关键词、图片链接、商品链接、店铺能力提示和推荐页；本轮未在文件选择器中提交真实本地图片，上传类型/大小与服务端参数由代码和自动测试覆盖。

## Final result

passed
