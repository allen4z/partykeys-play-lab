# PartyKeys Play Lab

PartyKeys / 音乐密码的网页与 iOS 演奏产品。线上版本：<https://op1.partykeys.ai>。

## 产品能力

- 36 键四层 Salamander Grand Piano 音源与合成兜底。
- 主音、旋律单音、智能三和弦。
- 8 拍循环录制、FX、节拍器和八步音序器。
- 九种风格音阶与屏幕 / 硬件同步灯光。
- Chrome / Edge Web MIDI、MidiBrowser BLE MIDI 与 USB MIDI。
- PartyKeys 36 CMD `0x15` / `0x71` 和 PopuPiano 29 独立设备 profile。
- 可安装 PWA，以及 `ios/PartyKeysPlay` 原生 iPhone / iPad App。

## Web

```sh
npm install
npm run dev
npm run build
```

PWA Manifest、Service Worker、App 图标和 Apple Touch Icon 已包含在 Web 构建中。

## iOS App

原生工程位于 `ios/PartyKeysPlay/MidiBrowser.xcodeproj`。App 使用 WKWebView 加载正式域名，通过 CoreMIDI 桥为网页提供 Web MIDI 与 SysEx；界面固定横屏并提供原生 BLE MIDI 设备连接页。

```sh
cd ios/PartyKeysPlay
xcodebuild \
  -project MidiBrowser.xcodeproj \
  -scheme MidiBrowser \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

## 发布验证

- Web：生产构建、PWA Manifest、Service Worker 与 HTTPS。
- iOS Simulator：App 编译及 22 项 AppConfig / bridge / MIDI / allowlist 测试。
- 真机：BLE MIDI、USB MIDI、PartyKeys/PopuPiano 灯光、重连与约 200 ms 灯光延迟必须在发布前复测。

钢琴采样署名见 `AUDIO_CREDITS.md`。

## 开源许可

- 项目代码采用 [MIT License](LICENSE)。
- `public/samples/` 中的 Salamander Grand Piano V3 采样继续遵循 CC BY 3.0，详见 `AUDIO_CREDITS.md`。
- PartyKeys / 音乐密码名称、Logo 和其他品牌标识不因代码开源而转让商标权。

## 部署信息

- 部署环境：生产 · 阿里云华东1（cn-hangzhou）
- 部署方案：Next.js 静态导出（`output: "export"` + `trailingSlash: true`）+ OSS + CDN
- 目标域名：https://op1.popumusic.cn （首页/隐私页/Service Worker/钢琴采样均已验证 200）
- OSS Bucket：`popumusic-web`（与其他 popumusic 子域共用），前缀 `apps/op1/`
- CDN 加速域名：`op1.popumusic.cn`，源站 `popumusic-web.oss-cn-hangzhou.aliyuncs.com`（oss，443），边缘函数 `back_to_origin_url_rewrite` 将 `^/(.*)$` 重写为 `/apps/op1/$1`（另配 `oss_auth`、`set_req_host_header`）
- DNS：`op1.popumusic.cn` CNAME → `op1.popumusic.cn.w.kunlunaq.com`（阿里云 DNS）
- 证书：CAS `popumusic-c-popumusic-cn-2026`（CertId 26624284，`*.popumusic.cn`，有效期至 2027-02-20）
- 构建：`npm run build` → 产物 `out/`，上传 `cd out && aliyun oss cp . oss://popumusic-web/apps/op1/ -r -f`（2026-08-25 已从独立 bucket `op1-popumusic-cn` 迁入，迁移后首页/SW/采样验证 200）
- 上传（带缓存头，降低 CDN 回源 TTFB）：
  - `cd out && aliyun oss cp . oss://popumusic-web/apps/op1/ -r -f --meta Cache-Control:no-cache`
  - `aliyun oss cp out/_next/static oss://popumusic-web/apps/op1/_next/static -r -f --meta Cache-Control:public,max-age=31536000,immutable`
  - `aliyun oss cp out/samples oss://popumusic-web/apps/op1/samples -r -f --meta Cache-Control:public,max-age=31536000,immutable`
  - `index.html` 保持 `no-cache`（协商验证），部署后在 CDN 控制台刷新 `/`；未带 hash 的覆盖文件（如 `brand-logo.png`、`sw.js`）也要一并刷新
- 性能待办（2026-08-27）：实测 TTFB ~600ms，瓶颈在 CDN 每请求执行 3 个边缘函数 + HTML 无边缘缓存，建议控制台为 `*.html` 配 5-10 分钟边缘缓存
- 注意：部署到 PopuMusic MIDI Browser 前需将 `op1.popumusic.cn` 加入发布清单 Whitelist（cpfile.poputar.com/MidiBrowser/publish.json）
