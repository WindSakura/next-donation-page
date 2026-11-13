# Next Donation Page

基于 Next.js App Router、React、Tailwind CSS 和 Stripe Embedded Checkout 的个人支持页面。

## 本地运行

需要 Node.js 22.12 或更高版本，建议使用 Node.js 24。统一使用 npm 和仓库中的 `package-lock.json`。

```sh
npm ci
```

复制 `.env.example` 为 `.env.local` 并填写环境变量：

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 可发布密钥，进入浏览器 bundle；本地使用 `pk_test_…` |
| `STRIPE_SECRET_KEY` | Stripe 服务端密钥，仅服务端使用；本地使用同一账户的 `sk_test_…` |
| `APP_URL` | 当前站点的 origin。本地为 `http://localhost:3000`；生产为 `https://donate.yakum0.moe` |

`APP_URL` 不能包含路径、查询参数或用户信息，非 localhost 地址必须使用 HTTPS。未配置时兼容现有生产域名。预览部署和自定义域名需要显式设置，否则来自该域名的支付创建请求将被拒绝。Stripe 返回地址使用这个固定 origin，不采用客户端的 `Origin` 或转发主机头。

```sh
npm run dev
```

访问 `http://localhost:3000`。未配置密钥时仍可构建和查看表单，支付功能会显示配置错误。`NEXT_PUBLIC_` 变量在构建时写入前端代码，修改后需要重新构建。

## 校验与构建

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

自动测试使用模拟 Stripe 响应，不会发起真实支付或创建真实 Checkout Session。生产启动使用 `npm start`。

`.github/workflows/ci.yml` 会在 main 推送和 PR 上执行安装、lint、类型检查、测试和生产构建，不需要 Stripe 密钥。

部署运行时同样需要上述环境变量。不要把 `.env.local` 或 Stripe 密钥提交到 Git。

## 金额规则

`src/lib/donation.ts` 同时供表单和 API 使用：

- 支持 CNY、USD、HKD、EUR、CAD、GBP、SGD。
- API 接收十进制字符串，例如 `{ "amount": "19.99", "currency": "USD" }`，金额单位为主货币单位。
- 服务端拆分整数和小数，准确转换为整数最小单位；不使用浮点金额乘以 100。
- CNY/HKD 的应用最低金额为 5，其他币种为 1，单次应用上限为 100000。预设金额在同一文件配置。
- 以上是本站的应用门槛，并不替代 Stripe 的结算币种、账户和支付方式限制。若 Stripe 要求更高的最低金额，API 会返回可读提示；请按实际账户调整共享配置。

旧版直接提交整数“分”的请求会返回 400；需要同步部署本轮前端和后端。

## 支付流程

1. 创建接口验证 JSON、金额、币种和请求来源。
2. 前端为每次确认金额生成幂等标识，重试同一次创建时复用，修改金额后生成新标识。
3. 服务端通过 Stripe 创建嵌入式结账，返回 `clientSecret` 和 `sessionId`。
4. Stripe 的完成回调和返回链接进入 `/success?session_id=…`。
5. 结果页通过服务端向 Stripe 查询真实状态，区分已付款、等待到账、尚未完成、过期和查询失败。URL 参数的存在本身不表示付款成功。

查询接口只返回状态、金额和币种，不返回邮箱；支付接口响应禁止缓存，页面不发送 Referrer。原有服务端 Stripe SDK 保留在 16.12.0，并显式固定 API 版本 `2024-06-20`，避免框架升级同时改变支付供应商协议。

本项目没有赞助榜、权益发放或本地捐赠数据库。如增加这些业务，应新增验签、幂等的 Stripe webhook，以支付事件更新持久化记录，并覆盖延迟付款成功和失败事件；不要以浏览器返回页面作为入账依据。

## 依赖说明

已迁移到 Next.js 16 / React 19，使用 ESLint 独立命令和 flat config。当前 Next.js lint 插件的 peer 范围需要 ESLint 9；开发依赖中对 `@typescript-eslint/typescript-estree` 的 `minimatch` 使用限定范围的 11.x 补丁 override，以处理旧版本的 glob 放大问题。升级该 lint 工具链后应重新评估并移除 override。
