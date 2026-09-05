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
- 🌗 **明暗主题** — 顶栏一键切换浅色 / 深色模式，默认跟随系统并自动记忆选择
- 🔎 **搜索直达** — 主页支持按名称 / 关键词即时搜索工具（快捷键 `/` 或 `Ctrl + K`）
- 🧭 **快捷导航** — 任意工具页可通过「全部工具」下拉菜单直接切换到其他工具
- 📱 **响应式设计** — 桌面、平板、手机均可流畅使用
- 🧩 **易扩展** — 新增工具只需添加一个页面 + 主页注册一个卡片，无需改后端
- 🚀 **一键部署** — 支持一键 Fork & Deploy 到自己的 Cloudflare 账号

## 🧰 功能列表

共 **53** 个工具，按开发 / 设计 / 运维 / 测试四个场景分类（除标注「云端」的工具外，全部本地计算）：

### 开发工具

| 工具 | 说明 | 状态 |
|:---|:---|:---:|
| **时间戳转换** | Unix 时间戳与日期互转，支持秒/毫秒自动识别、实时时钟 | ✅ |
| **JSON 格式化** | 格式化、压缩、校验 JSON，语法高亮与错误行列定位 | ✅ |
| **Base64 编解码** | 文本与 Base64 互转，支持 UTF-8 中文与 URL 安全变体 | ✅ |
| **URL 编解码** | 组件级 / 完整 URI 两种编码范围，实时转换 | ✅ |
| **私密内容分享** | 端到端加密生成分享链接，密钥只存于 URL fragment，支持阅后即焚 | ✅ |
| **哈希计算** | MD5 / SHA-1 / SHA-256 / SHA-384 / SHA-512 多算法摘要 | ✅ |
| **UUID 生成器** | 批量生成 UUID v4，支持大写、去连字符等格式 | ✅ |
| **JWT 解析** | 解码 Header / Payload，解读标准声明并判断过期状态 | ✅ |
| **HTML 实体编解码** | 命名实体与数字实体双向转换 | ✅ |
| **文本对比 Diff** | 按行比较差异，红绿高亮与增删统计 | ✅ |
| **Markdown 预览** | 左编辑右渲染，支持标题 / 表格 / 代码块等常用语法 | ✅ |
| **进制转换** | 2 / 8 / 10 / 16 / 36 进制互转，BigInt 支持超大整数 | ✅ |
| **Unicode 转换** | 文本与 \uXXXX / \u{…} 互转，附码点与 UTF-8 字节表 | ✅ |
| **随机密码生成** | 密码学安全随机数，可自定义字符集并评估强度 | ✅ |
| **URL 解析器** | 拆解协议 / 主机 / 路径 / 查询参数，逐项查看 | ✅ |

### 设计工具

| 工具 | 说明 | 状态 |
|:---|:---|:---:|
| **颜色转换** | HEX / RGB / HSL 互转，支持透明度与取色器预览 | ✅ |
| **图片格式转换** | PNG / JPEG / WebP 互转，支持透明底填充与质量调节 | ✅ |
| **图片压缩** | 质量与尺寸双重压缩，直观对比压缩前后体积 | ✅ |
| **图片变清晰** | 一键锐化增强边缘细节，前后对比预览 | ✅ |
| **AI 图像清晰度增强** | 调用百度云端 API 重绘级修复低清模糊照片（云端） | ✅ |
| **CSS 渐变生成** | 线性 / 径向渐变可视化配置，实时预览复制 CSS | ✅ |
| **CSS 盒阴影生成** | box-shadow 参数可视化调节，实时预览 | ✅ |
| **PX ⇄ REM 换算** | 按根字号双向换算，附常用值速查表 | ✅ |
| **图片裁剪** | 拖拽框选裁剪区域，支持精确坐标微调 | ✅ |
| **图片改尺寸** | 按像素 / 百分比缩放，锁定宽高比 | ✅ |
| **图片加水印** | 文字水印，九宫格定位或整图平铺 | ✅ |
| **图片转 Base64** | 编码为 Data URL，生成 CSS / HTML 内联片段 | ✅ |
| **Favicon 生成** | 文字 / Emoji 生成多尺寸网站图标 | ✅ |
| **配色方案生成** | 基于主色生成互补 / 三角 / 类似等经典配色 | ✅ |
| **缓动曲线预览** | cubic-bezier 可视化与动画演示 | ✅ |

### 运维工具

| 工具 | 说明 | 状态 |
|:---|:---|:---:|
| **Cron 表达式解析** | 可视化字段含义与最近 5 次执行时间推算 | ✅ |
| **IP 子网计算** | 网络 / 广播地址、掩码、可用主机范围与数量 | ✅ |
| **chmod 权限计算** | rwx 与八进制双向换算，支持特殊权限位 | ✅ |
| **HTTP 状态码速查** | 1xx~5xx 分类速查，支持搜索 | ✅ |
| **常用端口速查** | 常见端口与服务对照表，支持搜索 | ✅ |
| **存储单位换算** | KB/KiB 双体系换算与带宽下载速度换算 | ✅ |
| **Git 命令速查** | 场景化 Git 命令，点击复制 | ✅ |
| **Linux 命令速查** | 场景化 Linux 命令，点击复制 | ✅ |
| **世界时钟** | 多时区实时时钟，显示与本地时差 | ✅ |
| **文本去重排序** | sort \| uniq 可视化版：去重、排序、去空行 | ✅ |
| **DNS 记录查询** | 经 Cloudflare DoH 公共接口查询各类 DNS 记录（需联网） | ✅ |

### 测试工具

| 工具 | 说明 | 状态 |
|:---|:---|:---:|
| **正则表达式测试** | 实时匹配高亮、计数与分组捕获详情 | ✅ |
| **API 调试** | 轻量接口调试：自定义方法 / 头 / 体，查看响应详情 | ✅ |
| **测试数据生成** | 批量生成姓名 / 手机号 / 邮箱等假数据，导出 JSON / CSV | ✅ |
| **假文生成** | 拉丁 Lorem Ipsum 与中文假文，自定义段落句数 | ✅ |
| **CSV ⇄ JSON 互转** | 双向转换，支持自定义分隔符与引号转义 | ✅ |
| **字数统计** | 字符 / 汉字 / 单词 / 字节多维度统计 | ✅ |
| **正则表达式速查** | 常用校验正则与语法要点，点击复制 | ✅ |
| **User-Agent 解析** | 识别浏览器 / 内核 / 系统 / 设备与爬虫标记 | ✅ |
| **cURL 命令转代码** | 生成 fetch / axios / Python / Go 请求代码 | ✅ |
| **JSON 转 TS 类型** | 自动生成 TypeScript interface，数组合并可选字段 | ✅ |
| **占位图生成** | 自定义尺寸颜色的占位图，SVG / PNG / JPEG 输出 | ✅ |
| **身份证号校验** | 格式 / 区划 / 日期 / 校验位校验，支持 15 位升 18 位（纯本地） | ✅ |

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
│   ├── index.html           # 主页 —— 功能入口（搜索 + 分类筛选 + 工具卡片）
│   ├── assets/
│   │   ├── css/style.css    # 公共样式（含明暗双主题变量与通用组件）
│   │   └── js/
│   │       ├── common.js    # 公共脚本：主题切换 + 顶栏「全部工具」导航（内含 TOOLS 工具清单）
│   │       ├── image-utils.js # 图片工具共享库
│   │       └── secret-crypto.js # 私密分享端到端加密
│   └── tools/               # 每个工具一个目录，各含一个 index.html
│       ├── timestamp/  json/  base64/  url/  secret/     # 开发
│       ├── hash/  uuid/  jwt/  html-entity/  diff/       # 开发
│       ├── markdown/  base/  unicode/  password/  url-parse/
│       ├── color/  image-convert/  image-compress/  ...  # 设计
│       ├── gradient/  shadow/  px-rem/  palette/  easing/
│       ├── image-crop/  image-resize/  image-watermark/  image-to-base64/  favicon/
│       ├── cron/  ip-calc/  chmod/  http-status/  ports/ # 运维
│       ├── unit-storage/  git-cheatsheet/  linux-cheatsheet/
│       ├── world-clock/  text-sort/  dns-lookup/
│       ├── regex/  api/  mock-data/  lorem/  csv-json/   # 测试
│       └── char-count/  regex-sheet/  user-agent/  curl2fetch/  json2ts/  placeholder/  idcard/
├── src/                     # Worker 脚本（API 代理 + 私密分享）
├── wrangler.jsonc           # Cloudflare Workers 配置
├── package.json
└── README.md
```

## ➕ 如何新增一个工具

1. 在 `public/tools/<tool-name>/` 下新建 `index.html` 工具页面（引入 `style.css` 与 `common.js` 即可获得主题切换与导航能力）；
2. 在主页 `public/index.html` 的工具卡片列表中注册一个卡片（图标 + 名称 + 描述 + 关键词 + 链接），并同步到 `common.js` 的 TOOLS 清单；
3. 提交 PR 即可。纯静态页面，无任何后端改动。

## 🗺️ Roadmap

- [x] 项目骨架与主页功能入口（搜索 / 分类筛选 / 快捷导航）
- [x] 开发类 15 个：时间戳、JSON、Base64、URL 编解码、私密分享、哈希、UUID、JWT、HTML 实体、Diff、Markdown、进制、Unicode、密码生成、URL 解析
- [x] 设计类 15 个：颜色、图片格式转换、压缩、锐化、AI 增强、渐变、阴影、PX/REM、裁剪、改尺寸、水印、图片转 Base64、Favicon、配色、缓动曲线
- [x] 运维类 11 个：Cron、IP 子网、chmod、HTTP 状态码、端口、存储单位、Git 速查、Linux 速查、世界时钟、文本去重排序、DNS 查询
- [x] 测试类 12 个：正则测试、API 调试、测试数据、假文、CSV/JSON、字数统计、正则速查、UA 解析、cURL 转代码、JSON 转 TS、占位图、身份证校验
- [ ] 更多工具持续添加中 …

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。
