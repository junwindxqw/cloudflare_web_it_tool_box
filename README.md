<div align="center">

# 🧰 Cloudflare Web IT Tool Box

**基于 Cloudflare 免费服务的在线编程工具箱**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Deploy](https://img.shields.io/badge/Deploy-One--Click-green?logo=cloudflare&logoColor=white)](#-一键部署)

一个纯静态、零成本、开箱即用的 Web 工具箱，覆盖 **开发 / 设计 / 运维 / 测试** 场景中的常用小工具。
全部功能跑在 Cloudflare 免费服务（Workers 静态资源托管）上，无需服务器，全球 CDN 加速。

</div>

---

## ✨ 项目特性

- 🆓 **完全免费** — 仅使用 Cloudflare Workers 免费额度与免费静态资源托管，无任何付费依赖
- ⚡ **极速访问** — 部署后自动接入 Cloudflare 全球 CDN 边缘网络
- 🔒 **隐私安全** — 所有转换、格式化均在浏览器本地完成，**数据不上传服务器**
- 📱 **响应式设计** — 桌面、平板、手机均可流畅使用
- 🧩 **易扩展** — 新增工具只需添加一个页面 + 主页注册一个卡片，无需改后端
- 🚀 **一键部署** — 支持一键 Fork & Deploy 到自己的 Cloudflare 账号

## 🧰 功能列表

| 分类 | 工具 | 说明 | 状态 |
|:---:|:---|:---|:---:|
| 🕐 开发 | **时间戳转换** | Unix 时间戳与日期互转，支持秒/毫秒自动识别、实时时钟 | ✅ 已上线 |
| 开发 | **JSON 格式化** | 格式化、压缩、校验 JSON，语法高亮与错误行列定位 | ✅ 已上线 |
| 开发 | **Base64 编解码** | 文本与 Base64 互转，支持 UTF-8 中文与 URL 安全变体 | ✅ 已上线 |
| 开发 | **URL 编解码** | 组件级 / 完整 URI 两种编码范围，实时转换 | ✅ 已上线 |
| 设计 | **颜色转换** | HEX / RGB / HSL 互转，支持透明度与取色器预览 | ✅ 已上线 |
| 设计 | **图片格式转换** | PNG / JPEG / WebP 互转，支持透明底填充与质量调节 | ✅ 已上线 |
| 设计 | **图片压缩** | 质量与尺寸双重压缩，直观对比压缩前后体积 | ✅ 已上线 |
| 设计 | **图片变清晰** | 一键锐化增强边缘细节，前后对比预览 | ✅ 已上线 |
| 设计 | **AI 图像清晰度增强** | 调用百度云端 API 重绘级修复低清模糊照片；新人每月最高 3000 次免费 | ✅ 已上线 |
| 运维 | **Cron 表达式解析** | 可视化字段含义与最近 5 次执行时间推算 | ✅ 已上线 |
| 测试 | **正则表达式测试** | 实时匹配高亮、计数与分组捕获详情 | ✅ 已上线 |

> 💡 欢迎通过 [Issue](https://github.com/junwindxqw/cloudflare_web_it_tool_box/issues) 提出你想要的工具，或提交 PR 贡献新功能。

## 🚀 一键部署

点击下方按钮，授权登录 Cloudflare 后即可将本仓库一键部署为你自己的在线工具箱：

**[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/junwindxqw/cloudflare_web_it_tool_box)**

部署过程会自动完成：克隆仓库 → 读取 `wrangler.jsonc` 配置 → 创建并发布 Workers 项目 → 分配 `*.workers.dev` 免费域名。

## 🛠️ 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/junwindxqw/cloudflare_web_it_tool_box.git
cd cloudflare_web_it_tool_box

# 2. 安装依赖（Wrangler CLI）
npm install

# 3. 本地启动开发服务器
npm run dev

# 4. 打开浏览器访问 http://localhost:8787
```

## ☁️ 手动部署

```bash
# 1. 登录 Cloudflare 账号（首次使用会打开浏览器授权）
npx wrangler login

# 2. 部署到 Cloudflare Workers
npm run deploy
```

部署成功后终端会输出线上访问地址（形如 `https://web-it-tool-box.<你的子域>.workers.dev`）。

## 📁 项目结构

```text
cloudflare_web_it_tool_box
├── public/                  # 静态资源根目录（Workers 托管目录）
│   ├── index.html           # 主页 —— 功能入口（点击图标进入对应工具）
│   ├── assets/
│   │   ├── css/style.css    # 公共样式
│   │   └── js/image-utils.js # 图片工具共享库
│   └── tools/
│       ├── timestamp/       # 时间戳转换工具
│       │   └── index.html
│       ├── json/            # JSON 格式化工具
│       │   └── index.html
│       ├── base64/          # Base64 编解码工具
│       │   └── index.html
│       ├── url/             # URL 编解码工具
│       │   └── index.html
│       ├── color/           # 颜色转换工具
│       │   └── index.html
│       ├── image-convert/   # 图片格式转换工具
│       │   └── index.html
│       ├── image-compress/  # 图片压缩工具
│       │   └── index.html
│       ├── image-sharpen/   # 图片变清晰工具
│       │   └── index.html
│       ├── image-upscale/   # AI 图像清晰度增强工具（云端 API）
│       │   └── index.html
│       ├── cron/            # Cron 表达式解析工具
│       │   └── index.html
│       └── regex/           # 正则表达式测试工具
│           └── index.html
├── wrangler.jsonc           # Cloudflare Workers 配置
├── package.json
└── README.md
```

## ➕ 如何新增一个工具

1. 在 `public/tools/<tool-name>/` 下新建 `index.html` 工具页面；
2. 在主页 `public/index.html` 的工具卡片列表中注册一个卡片（图标 + 名称 + 描述 + 链接）；
3. 提交 PR 即可。纯静态页面，无任何后端改动。

## 🗺️ Roadmap

- [x] 项目骨架与主页功能入口
- [x] 时间戳转换
- [x] JSON 格式化
- [x] Base64 编解码
- [x] URL 编解码
- [x] 颜色转换
- [x] 图片格式转换
- [x] 图片压缩
- [x] 图片变清晰
- [x] AI 图像清晰度增强（云端）
- [x] Cron 表达式解析
- [x] 正则表达式测试
- [ ] 更多工具持续添加中 …

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。
