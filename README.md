# Next Donation Page

基于 Next.js App Router、React、Tailwind CSS 和 Stripe Checkout Elements 的个人支持页面。

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

自动测试使用模拟 Stripe 响应，不会发起真实支付或创建真实 Checkout Session。支付组件测试使用 jsdom、真实 React Stripe Provider 和模拟 Stripe.js SDK，验证主题更新、输入保留、重复提交锁定、失败重试与快捷支付事件。生产启动使用 `npm start`。

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
3. 服务端创建 `ui_mode: 'elements'` 的 Stripe Checkout Session，返回 `clientSecret` 和 `sessionId`。前端通过 `CheckoutElementsProvider` 渲染联系方式、支付方式和可用的快捷支付组件，敏感字段仍在 Stripe iframe 内。
4. 前端通过 `checkout.confirm` 确认支付，完成回调和支付方式返回链接进入 `/success?session_id=…`。
5. 结果页通过服务端向 Stripe 查询真实状态，区分已付款、等待到账、尚未完成、过期和查询失败。URL 参数的存在本身不表示付款成功。

查询接口只返回状态、金额和币种，不返回邮箱；支付接口响应禁止缓存，页面不发送 Referrer。

服务端 Stripe SDK 固定为 `23.1.0`，API 显式固定为该 SDK 对应的 `2026-10-28.endive`，与类型定义保持一致。为支持动态浅/深色，支付界面从整页 `embedded_page` 切换为 Checkout Elements，并移除该模式不接受的 `submit_type`；金额精度、幂等键和支付结果判断保持原有规则。后续升级时需要同时核对 SDK 迁移指南、API 版本和 Checkout 参数。此配置仅指定本站请求使用的版本，不修改 Stripe 账户默认 API 版本或其他 webhook 的版本。

回归测试除了模拟业务响应，也使用真实 SDK 和模拟 HTTP 传输，检查 API 版本头、Checkout 参数编码、查询结果以及 Stripe 错误的转换；不会访问 Stripe 或创建支付记录。部署后的实际支付体验仍需在 Stripe 测试模式验收。

本项目没有赞助榜、权益发放或本地捐赠数据库。如增加这些业务，应新增验签、幂等的 Stripe webhook，以支付事件更新持久化记录，并覆盖延迟付款成功和失败事件；不要以浏览器返回页面作为入账依据。

## 界面与主题

页面保留原有动漫背景和战队文案，视觉与交互参考 Beautiful UI、beUI、Rare UI、Transitions.dev 和 shadcn/ui。桌面使用横向布局，小屏使用单列；动效遵循 `prefers-reduced-motion`。

右上角支持跟随系统、浅色、深色三种主题。Stripe 字段通过官方 Appearance API 在浅色时使用 `stripe`、深色时使用 `night`；颜色配置位于 `src/lib/stripe-appearance.ts`。`next-themes` 的 `resolvedTheme` 同步系统偏好和手动选择，React Stripe Provider 通过 `changeAppearance` 更新字段外观，切换主题不会重新创建 Session 或重挂载输入框。仅主动点击加载失败后的重试按钮才会重载组件，仍使用同一个 Session。

快捷支付按钮由 Stripe 按账户设置、设备和浏览器能力决定是否展示；Apple Pay、Google Pay 等钱包需要在 Stripe 后台完成适用域名注册。支付界面改动需要前后端一起部署。发布后建议在测试模式验证银行卡、钱包和跳转支付方式。

## 依赖说明

已迁移到 Next.js 16 / React 19，使用 ESLint 独立命令和 flat config。当前 Next.js lint 插件的 peer 范围需要 ESLint 9；开发依赖中对 `@typescript-eslint/typescript-estree` 的 `minimatch` 使用限定范围的 11.x 补丁 override，以处理旧版本的 glob 放大问题。升级该 lint 工具链后应重新评估并移除 override。
