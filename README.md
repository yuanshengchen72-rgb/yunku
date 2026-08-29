# 电潮分销

面向1688服务市场的网页铺货工具。当前阶段已经打通“1688授权 → 租户会话 → 批量导入分销商品 → 保存商品快照”的代码链路，下一阶段接入微信小店。

## 已完成

- React + Fastify + TypeScript 单仓库工程。
- 官方开放平台应用“电潮分销”（AppKey `3255489`）的1688 OAuth授权开始页与回调。
- 授权码换取 `access_token/refresh_token`、过期前自动刷新。
- URL Path + 排序参数的 HMAC-SHA1 签名。
- `alibaba.fenxiao.productInfo.get` 真实连接器及内部商品模型转换。
- AES-256-GCM令牌加密；配置MySQL后持久化租户、令牌和商品快照。
- 每次最多20条1688商品链接或 Offer ID 的批量导入。
- 模拟连接器、23项自动化测试和首份Drizzle迁移。

2026-08-30 已在聚石塔 SAE 完成第一次真实线上验收：测试账号 OAuth 授权成功，
`alibaba.fenxiao.productInfo.get` 已成功读取真实 Offer `1024740590776` 的标题、
类目、图片、2 个 SKU、采购价和库存快照。线上入口为
`https://dianchao1688.com/`，当前固定部署镜像为 `sha-6d2aff3`。

当前阶段只覆盖 1688 商品导入和快照保存；微信小店绑定、类目校验、图片上传、
商品发布、审核状态及订单回流属于下一阶段，不应将当前测试环境描述为已完成正式铺货闭环。

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

首份迁移位于 `drizzle/0000_massive_gambit.sql`。

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
