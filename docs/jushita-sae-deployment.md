# 电潮分销：聚石塔 SAE 首次部署清单

目标是先部署一个可访问的测试环境，完成1688真实授权和商品详情接口联调；暂不配置微信小店。

## 1. 部署前资源

- 聚石塔原生SAE应用，运行时选择容器镜像。
- GitHub Actions 生成的 GHCR 镜像，地址为 `ghcr.io/yuanshengchen72-rgb/yunku`。
- 聚石塔RDS MySQL 8数据库。
- 应用公网访问入口及HTTPS域名。
- 能访问 `gw.open.1688.com` 的公网出站网络。

首版保持一个SAE实例。当前会话和OAuth一次性状态在进程内存中，多实例会导致授权回调随机落到另一实例而失败。

## 2. 构建镜像

推送 `main` 分支后，`.github/workflows/publish-container.yml` 会自动构建 `linux/amd64` 镜像并发布两个标签：

```text
ghcr.io/yuanshengchen72-rgb/yunku:main
ghcr.io/yuanshengchen72-rgb/yunku:sha-<提交短哈希>
```

SAE固定使用本次构建生成的 `sha-*` 标签，不使用 `latest`。首次发布后，将GitHub容器包设为Public供SAE匿名拉取；如果容器包保持Private，则在SAE自定义镜像配置中填写具有只读Packages权限的GitHub凭证。

## 3. 数据库

在部署前通过安全网络执行：

```powershell
npm run db:migrate
```

数据库账号首版只需目标库的建表和读写权限，不要使用RDS管理员账号作为应用长期凭据。

## 4. SAE环境变量

必须配置：

```text
NODE_ENV=production
PORT=3000
ALIBABA_APP_KEY=3255489
ALIBABA_APP_SECRET=<在SAE控制台秘密变量中填写>
ALIBABA_CALLBACK_URL=https://你的测试域名/api/auth/1688/callback
ALIBABA_AUTHORIZE_URL=https://auth.1688.com/oauth/authorize
ALIBABA_GATEWAY_URL=https://gw.open.1688.com
ALIBABA_CONNECTOR_MODE=real
TOKEN_ENCRYPTION_KEY=<32字节随机值的Base64>
MYSQL_URL=mysql://用户名:密码@RDS内网地址:3306/dianchao_distribution
WEB_ORIGIN=https://你的测试域名
```

不要把 `ALIBABA_APP_SECRET`、`TOKEN_ENCRYPTION_KEY` 或数据库密码写入镜像、仓库、构建日志或聊天。

## 5. 健康检查

- 端口：`3000`
- HTTP路径：`/api/health`
- 成功状态码：`200`

健康接口会返回当前 AppKey、连接器模式及1688是否已配置，但不会返回任何密钥。

## 6. 1688开放平台配置

当前应用为“电潮分销”，AppKey `3255489`。

- 授权回调地址：必须与 `ALIBABA_CALLBACK_URL` 完全一致。
- 日常使用入口：填写测试环境首页 `https://你的测试域名/`；若平台要求托管授权回调入口，则使用 `/api/auth/1688/callback`。
- 提交审核前再将测试域名切换为正式域名，不共用测试数据库和加密密钥。

## 7. 第一次真实验收

1. 打开 `https://你的测试域名/api/auth/1688/start`。
2. 使用测试1688采购账号授权。
3. 回到首页后应显示“1688账号已连接”。
4. 输入一件已确认支持一件代发、SKU较少的真实商品链接。
5. 检查标题、图片、类目、SKU、采购价和库存。
6. 如字段为空，保留脱敏后的原始响应结构，用于校准 `product-mapper.ts`，不要记录Token。

## 8. 回滚

- 应用部署失败：回滚到上一镜像版本，不删除RDS。
- OAuth失败：保持模拟模式或修正回调地址后重新授权。
- 字段映射失败：不写微信小店，先修正1688响应映射并重新导入。
