## 升级图片变清晰工具为 AI 超分辨率（UpscalerJS 集成）

### 目标
把现有基于"3×3 卷积锐化"的 `/tools/image-sharpen/` 升级为**AI 超分辨率**方案，让你上传的低清模糊图片（如图 1 的 287×426 模糊人像、图 2 的低清海边女生）能真正重建细节变清晰。

### 选定的技术决策（默认偏好）
| 决策点 | 选择 | 理由 |
|:---|:---|:---|
| 集成方式 | **CDN 脚本标签**（jsDelivr） | 零构建、零 npm 依赖、保持现有项目结构 |
| 模型 | **ESRGAN-slim x2** | 0.9 MB 体积，所有现代浏览器跑得动，对人像和通用照片提升最明显 |
| 工具架构 | **保留 sharpen，新增 upscale**（独立页面 `/tools/image-upscale/`） | 两类功能场景不同：锐化适合边缘/对比问题、超分适合低清放大 |
| UI 状态 | 进度条 + 模型加载提示 + 处理中禁用 | AI 处理秒级，必须明确反馈 |

### 实施步骤

**1. 新建工具页 `public/tools/image-upscale/index.html`**
- 沿用 image-sharpen 的三 panel 结构（dropzone → 设置 → 结果对比），全部复用现有 CSS 类（`dropzone / range-row / compare-grid / btn / btn-row / panel / hint / err-box / stat-bar`）
- 复用 `assets/js/image-utils.js`（`IMG.loadImageFile / canvasToBlob / downloadBlob / baseName / extOf / setupDrop`），不新增任何工具函数
- 新增专属 UI 元素：
  - 模型状态指示器（"未加载 / 加载中 X% / 已就绪 / 处理中 Y%"）
  - 加载进度条（用 `fetch` + `ReadableStream` 包装模型下载）
  - 大尺寸警告（>2000×2000 像素时提示）
- CDN 引入 3 个脚本（head 内）：
  - `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js`
  - `https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0/dist/browser/umd/index.min.js`
  - `https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js`
- 全局变量：`upscaler`（懒懒懒初始化，首次 upscale 时才创建）、`current`、`output`、`runToken`
- 复刻 image-sharpen 的**并发令牌模式**（`let runToken = 0; 三处 token 校验; finally 仅匹配时解锁按钮`），加一层 `modelLoadToken` 守护模型预热

**2. 主页 `public/index.html`**
- 现有 sharpen 卡片**保持不变**
- 在设计分类追加一张 `🪄 AI 超分辨率放大` 卡片，`/tools/image-upscale/`，`data-cat="design"`，"已上线"徽章

**3. README 同步**
- 功能表追加一行：`设计 | **AI 图片超分** | ESRGAN 模型放大 2 倍并重建细节，浏览器本地推理 | ✅ 已上线`
- Roadmap 追加：`[x] AI 图片超分`
- 项目结构新增：`image-upscale/   # AI 图片超分辨率放大工具`

**4. 验证（用合成图片，不依赖真实文件）**
- 浏览器内合成低分辨率 + 模糊测试图（模拟你图 1 的 287×426 场景）
- 调用与拖拽/点击相同的 `handleFile` 入口
- 验证项：模型加载成功、超分后尺寸精确为 ×2、与原图相比像素确实改变、下载 PNG 正常
- 同时保留 sharpen 回归（确保未受影响）

**5. 不做的事（保持项目简洁）**
- 不引入 npm 依赖 / 不改 wrangler 配置 / 不引入构建步骤
- 不删 sharpen 页面（保留作为"快速锐化"选项）
- 不写详细的 vendor 自托管（jsdelivr 在国内可访问，且 Workers Static Assets 25 MiB 单文件限制够用）

### 文件变更清单
| 文件 | 动作 |
|:---|:---|
| `public/tools/image-upscale/index.html` | 新建（~200 行） |
| `public/index.html` | 追加 1 张卡片 |
| `README.md` | 功能表 + Roadmap + 目录树各 1 处更新 |

**预计工作量**：1 次提交、1 次推送、1 次部署即可完成。

### 参考
- UpscalerJS 1.0 + ESRGAN-slim 模型（<https://upscalerjs.com>）
- 当前 sharpen 的并发令牌模式作为本工具的并发安全范式
- Workers 静态资源对 wasm/bin 自动 MIME，零额外配置