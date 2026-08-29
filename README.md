# 电潮分销

面向1688服务市场的网页铺货工具。当前代码已打通“1688授权 → 租户会话 → 批量导入分销商品 → 保存商品快照 → 绑定微信小店 → 创建并跟踪商品×店铺铺货任务”的链路。

## 已完成

- React + Fastify + TypeScript 单仓库工程。
- 官方开放平台应用“电潮分销”（AppKey `3255489`）的1688 OAuth授权开始页与回调。
- 授权码换取 `access_token/refresh_token`、过期前自动刷新。
- URL Path + 排序参数的 HMAC-SHA1 签名。
- `alibaba.fenxiao.productInfo.get` 真实连接器及内部商品模型转换。
- AES-256-GCM令牌加密；配置MySQL后持久化租户、令牌和商品快照。
- 每次最多20条1688商品链接或 Offer ID 的批量导入。
- 参照业务样例实现链接铺货、货源推荐、货源搜索和铺货记录四个页面。
- 微信小店自研 AppID/AppSecret 服务端验证、AES-256-GCM 加密保存、脱敏回显与解绑。
- 每个“商品 × 店铺”独立生成铺货子任务，并持久化批次、状态和失败信息。
- 模拟连接器、自动化测试和 Drizzle 迁移。

2026-08-30 已在聚石塔 SAE 完成第一次真实线上验收：测试账号 OAuth 授权成功，
`alibaba.fenxiao.productInfo.get` 已成功读取真实 Offer `1024740590776` 的标题、
类目、图片、2 个 SKU、采购价和库存快照。线上入口为
`https://dianchao1688.com/`，当前固定部署镜像为 `sha-6d2aff3`。

当前线上固定镜像仍是上一版本。新版本完成了微信小店绑定和铺货任务创建，真实微信商品发布仍必须先具备客户店铺 AppID/AppSecret、聚石塔固定出口 IP、店铺类目权限及至少一个已确认的类目/属性映射。缺少这些外部条件时任务会保持待处理，不应描述为已完成正式微信发品闭环。

## 本地模拟运行

1. 复制 `.env.example` 为 `.env`，保持 `ALIBABA_CONNECTOR_MODE=mock`。
2. 安装依赖：`npm install`。
3. 启动：`npm run dev`。
4. 打开 `http://localhost:5173`。

可以使用模拟 Offer ID `789870588118` 测试批量导入。

## 真实1688联调

1. 准备MySQL数据库并设置 `MYSQL_URL`；应用启动时会自动执行镜像内的已提交迁移。
2. 生成32字节Base64随机密钥，设置为 `TOKEN_ENCRYPTION_KEY`。
3. 在 SAE 保密字典（K8s Secret）中保存 `ALIBABA_APP_SECRET`，部署时引用该键作为同名环境变量；不要将值写入普通环境变量、镜像、仓库、日志或聊天。
4. 将 `ALIBABA_CALLBACK_URL` 改成可公网HTTPS访问的完整地址，例如：

   ```text
   https://你的域名/api/auth/1688/callback
   ```

5. 在1688开放平台为当前应用配置完全相同的授权回调地址；当前线上值为
   `https://dianchao1688.com/api/auth/1688/callback`。
6. 设置 `ALIBABA_CONNECTOR_MODE=real`，启动后访问 `/api/auth/1688/start` 完成授权。
7. 用已授权账号可访问的一件代发商品执行第一次导入，并对照原始返回确认字段映射。

本地生成加密密钥的示例：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

## 数据库

生成迁移：

```powershell
npm run db:generate
```

本地手动执行迁移（可选；生产容器启动时会自动执行）：

```powershell
npm run db:migrate
```

迁移位于 `drizzle/` 目录；应用启动时按顺序执行所有已提交迁移。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

## 容器镜像

推送到 GitHub `main` 分支后，工作流会自动构建并发布：

```text
ghcr.io/yuanshengchen72-rgb/yunku:main
ghcr.io/yuanshengchen72-rgb/yunku:sha-<提交短哈希>
```

聚石塔 SAE 部署时使用不可变的 `sha-*` 标签。首次构建完成后，需要在 GitHub Package 设置中把容器包可见性设为 Public，SAE 才能匿名拉取；也可以保留 Private 并在 SAE 中配置 GHCR 凭证。

## 安全约束

- AppKey不是密钥；AppSecret、1688 Token和微信小店密钥不得进入浏览器、日志或代码仓库。
- 真实生产模式必须同时配置 `TOKEN_ENCRYPTION_KEY` 和 `MYSQL_URL`，否则应用拒绝启动。
- 每个授权账号映射到独立租户，商品快照和令牌查询都带 `tenant_id`。
- 当前登录会话和OAuth `state` 仍为单实例内存存储，适合首版单实例SAE；每次部署后浏览器需要重新登录，扩容前应迁移到共享存储。

产品与接口依据见 [`docs/`](./docs/) 目录。
