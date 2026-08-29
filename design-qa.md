# Design QA

## Source of truth

- 链接铺货：`C:\Users\82531\AppData\Local\Temp\codex-clipboard-cbbbd12a-4cc1-44a2-b9b5-42d07ccb7f66.png`
- 货源推荐：`C:\Users\82531\AppData\Local\Temp\codex-clipboard-8b57604d-2e58-4ba4-be7c-182f1209e1c1.png`
- 货源搜索：`C:\Users\82531\AppData\Local\Temp\codex-clipboard-3ca31364-a928-4dbe-be85-f77307d5f392.png`
- 铺货记录：`C:\Users\82531\AppData\Local\Temp\codex-clipboard-add22ddb-ffab-4b01-8c6d-9c481a49e34b.png`

四张源图均为 1718 × 1296 px。产品约束要求保留“电潮分销”名称和既有品牌图标，因此没有复制参考产品的“小猪铺货”名称或猪形标识。

## Implementation captures

- 链接铺货：`E:\Myprojects\云库\qa\link-implementation-final.png`
- 货源推荐：`E:\Myprojects\云库\qa\recommend-implementation-final.png`
- 货源搜索默认态：`E:\Myprojects\云库\qa\search-implementation-final.png`
- 货源搜索批量态：`E:\Myprojects\云库\qa\search-dialog-implementation-final.png`
- 铺货记录：`E:\Myprojects\云库\qa\records-implementation-final.png`

所有最终实现截图均为 1718 × 1296 px，浏览器 CSS 视口 1718 × 1296，DPR 1。源图和实现图以 1:1 CSS 像素密度比较，无缩放归一化。

## States compared

- 链接铺货：空输入、顺序平均分配、未选店铺。
- 货源推荐：无导入商品的默认推荐空态。
- 货源搜索：搜关键词默认态和“批量搜索”展开态。
- 铺货记录：无记录空态；有记录时的表格结构另以浏览器核心流程验证。

## Comparison history

1. 第一轮全页对照发现：1280 px 预览触发推荐页两列降级、左侧导航残留焦点框、搜索批量态使用遮罩弹窗、记录表列名与参考图不一致。
2. 修复：锁定参考视口；推荐信息卡保持四列；移除非参考焦点描边；将批量搜索改为输入框下方展开面板；记录表恢复“修改规则ID”列。
3. 第二轮同图对照发现：服务重启后本地开发会话令牌失效时页面出现两条“请求失败”。
4. 修复：模拟模式遇到 401 时清除过期令牌并自动重建开发会话。
5. 最终轮逐页将源图与实现截图放入同一比较输入。四页的整体网格、双层头部、240 px 左栏、内容卡片、橙色主操作、搜索展开态和记录表结构均达到目标；剩余差异均为产品品牌约束或真实数据/空态差异。

## Findings

- P0：无。
- P1：无。
- P2：参考产品品牌被有意替换为“电潮分销”；货源推荐没有复制参考站的外部浮动工具条和营销助理，因为不属于四页核心任务；推荐页在有真实已导入商品时显示真实商品卡，而参考截图处于骨架加载态。
- P3：Ant Design 的表单控件字形、空态插图和分页细节与参考站私有组件存在轻微差异，不影响层级、密度或操作路径。

## Final result

passed
