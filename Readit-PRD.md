# READIT v2

**Personal Read-It-Later System**

产品需求文档 | Product Requirements Document

---

| 项目 | 内容 |
|------|------|
| 版本 | 2.0 |
| 日期 | 2026-03-09 |
| 作者 | Ryan |
| 状态 | Draft |
| 架构 | GitHub Repo + Actions + Pages（无服务器） |
| 客户端 | iOS Shortcuts + 静态网页 |
| 存储 | GitHub Repo（数据/内容） + 阿里云 OSS（音频） |

本文档定义了 Readit v2 的完整产品需求。相比 v1 的原生 App 方案，v2 采用纯 Web 技术栈 + GitHub 基础设施，大幅降低开发和维护成本。

---

## 1. 产品概述

### 1.1 产品定义

Readit 是一个个人 Read-It-Later 系统，基于 GitHub 基础设施构建。用户通过 iOS Shortcut 分享链接保存文章，GitHub Actions 自动抓取正文、生成摘要和沉浸式翻译，每日自动生成策展播客音频。用户通过 GitHub Pages 静态网页阅读文章和收听播客。

### 1.2 核心价值主张

- **一键保存**：iOS Shortcut 分享链接，一步完成
- **自动处理**：GitHub Actions 定时抓取、摘要、翻译，无需人工干预
- **沉浸式阅读**：英文内容自动生成双语交替排版
- **每日策展**：24h 内文章自动浓缩为中文播客音频
- **零运维**：无服务器、无数据库、无月费（仅 API 调用成本）

### 1.3 与 v1 方案的核心差异

| 维度 | v1（原生 App） | v2（Web 技术栈） |
|------|---------------|-----------------|
| 客户端 | SwiftUI iOS + macOS App | iOS Shortcut + 静态网页 |
| 后端 | 无（纯本地处理） | GitHub Actions |
| 存储 | SwiftData + CloudKit | GitHub Repo + 阿里云 OSS |
| 内容抓取 | URLSession → Jina → WKWebView | Jina Reader（唯一路径） |
| 部署 | App Store / TestFlight | GitHub Pages（零部署） |
| 开发成本 | 高（Swift/SwiftUI） | 低（Node.js + HTML） |
| 离线阅读 | 支持 | 不支持（依赖网页访问） |

---

## 2. 技术架构

### 2.1 技术栈总览

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 文章保存入口 | iOS Shortcuts → GitHub API | `repository_dispatch` 事件触发 |
| 任务调度 | GitHub Actions | cron 定时 + event 触发 |
| 内容抓取 | Jina Reader API | 服务端渲染，支持 JS 页面，无需浏览器 |
| 摘要 / 翻译 / 策展 | Claude API (Sonnet) | 智能内容处理 |
| 语音合成 | OpenAI TTS API | 每日策展播客音频 |
| 数据存储 | GitHub Repo（JSON + Markdown） | 文章元数据 + 正文内容 |
| 音频存储 | 阿里云 OSS | 策展播客 MP3 文件 |
| 前端 | GitHub Pages（静态 HTML） | 极简阅读界面 + 音频播放器 |
| 运行时 | Node.js | Actions 中的脚本执行环境 |

### 2.2 架构原则

- **GitHub 即后端**：Repo 是数据库，Actions 是计算层，Pages 是前端，Secrets 是密钥管理
- **无服务器**：不维护任何服务器、容器、数据库实例
- **幂等处理**：每次 Action 运行检查状态，只处理未完成的文章，可安全重复运行
- **渐进增强**：保存即入库，处理异步完成，前端展示已处理的内容

### 2.3 系统流程图

```
用户发现文章
    ↓
iOS Shortcut 分享
    ↓
GitHub API (repository_dispatch)
    ↓
┌─────────────────────────────────┐
│ GitHub Action: save-article     │
│ → 写入 articles.json            │
│ → git commit & push             │
└─────────────────────────────────┘
    ↓ (定时触发 or 链式触发)
┌─────────────────────────────────┐
│ GitHub Action: process-articles │
│ → Jina Reader 抓取正文          │
│ → Claude 生成摘要               │
│ → Claude 沉浸式翻译（英文）      │
│ → 保存 Markdown + 更新 JSON     │
│ → git commit & push             │
│ → 触发 Pages 部署               │
└─────────────────────────────────┘
    ↓ (每日 cron)
┌─────────────────────────────────┐
│ GitHub Action: daily-curation   │
│ → 汇总 24h 内文章               │
│ → Claude 生成中文总结            │
│ → OpenAI TTS 生成音频            │
│ → 上传音频至阿里云 OSS           │
│ → 更新 episodes.json             │
│ → git commit & push              │
│ → 触发 Pages 部署                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ GitHub Pages 静态网站            │
│ → 文章列表 + 详情阅读            │
│ → 每日策展 + 音频播放            │
└─────────────────────────────────┘
```

---

## 3. 数据模型

### 3.1 Repo 文件结构

```
readit/
├── .github/workflows/
│   ├── save-article.yml          # 保存文章 workflow
│   ├── process-articles.yml      # 处理文章 workflow
│   └── daily-curation.yml        # 每日策展 workflow
├── scripts/
│   ├── save-article.js           # 保存逻辑
│   ├── process-articles.js       # 抓取 + 摘要 + 翻译
│   ├── daily-curation.js         # 策展总结 + TTS + OSS 上传
│   └── build-site.js             # 生成静态网页
├── data/
│   ├── articles.json             # 文章元数据索引
│   ├── episodes.json             # 策展播客索引
│   └── articles/                 # 文章内容目录
│       ├── {id}.md               # 原始正文（Markdown）
│       └── {id}.zh.md            # 中文翻译（仅英文文章）
├── site/                         # GitHub Pages 静态文件
│   ├── index.html                # 首页 / 文章列表
│   ├── article.html              # 文章详情页
│   ├── curation.html             # 策展播客页
│   └── style.css                 # 样式
├── package.json
└── README.md
```

### 3.2 Article 数据结构（articles.json）

```json
{
  "id": "20260309-a1b2c3",
  "url": "https://example.com/article",
  "sourceType": "web | twitter",
  "status": "pending | fetched | ready | error",
  "savedAt": "2026-03-09T10:30:00Z",
  "processedAt": "2026-03-09T11:00:00Z",
  "title": "文章标题",
  "siteName": "example.com",
  "summary": "AI 生成的中文摘要（3-5 句）",
  "language": "en | zh | other",
  "originalFile": "data/articles/20260309-a1b2c3.md",
  "translatedFile": "data/articles/20260309-a1b2c3.zh.md",
  "errorMessage": null
}
```

### 3.3 Episode 数据结构（episodes.json）

```json
{
  "id": "ep-2026-03-09",
  "date": "2026-03-09",
  "generatedAt": "2026-03-09T07:00:00Z",
  "articleCount": 8,
  "articleIds": ["20260309-a1b2c3", "..."],
  "summaryText": "今日策展的中文文字总结...",
  "audioUrl": "https://readit.oss-cn-shanghai.aliyuncs.com/episodes/ep-2026-03-09.mp3",
  "duration": 320
}
```

---

## 4. 功能规格

### 4.1 文章保存

#### 4.1.1 iOS Shortcut

用户在任意 App 中点击分享 → 选择 Readit Shortcut → Shortcut 提取 URL → 调用 GitHub API 触发 `repository_dispatch` 事件。

Shortcut 实现逻辑：

1. 接收分享输入，提取 URL
2. 构造 HTTP 请求：`POST https://api.github.com/repos/{owner}/{repo}/dispatches`
3. Headers: `Authorization: Bearer {GITHUB_PAT}`, `Accept: application/vnd.github+json`
4. Body: `{"event_type": "save-article", "client_payload": {"url": "{URL}"}}`
5. 显示"已保存"通知

认证方式：GitHub Personal Access Token（Fine-grained），仅需 `contents: write` 权限，存储在 Shortcut 的变量中。

#### 4.1.2 备用保存方式

除 Shortcut 外，也可以通过以下方式保存：

- **手动触发 Action**：在 GitHub Actions 页面手动运行 save-article workflow，输入 URL
- **直接编辑 JSON**：在 GitHub 网页上直接编辑 articles.json（应急方式）

### 4.2 文章处理

#### 4.2.1 触发方式

两种触发机制并存：

- **链式触发**：save-article workflow 完成后，自动触发 process-articles workflow
- **定时触发**：cron 每 30 分钟运行一次，处理所有 pending 状态的文章

两种触发共存确保：单篇文章保存后尽快处理（链式），同时兜底处理遗漏的文章（定时）。

#### 4.2.2 内容抓取（Jina Reader）

对所有 status = pending 的文章：

1. 调用 Jina Reader API：`GET https://r.jina.ai/{article_url}`
2. Jina Reader 在服务端使用 headless browser 渲染页面并提取正文
3. 返回 Markdown 格式的干净正文
4. 提取标题、正文，保存为 `data/articles/{id}.md`
5. status 更新为 fetched

Jina Reader 的优势是单一路径解决所有页面类型，包括 JS 渲染的 SPA 页面和 Twitter/X 内容，不需要分多条路径处理。

#### 4.2.3 AI 处理（Claude）

对所有 status = fetched 的文章：

1. **语言检测 + 摘要**：将正文发送给 Claude，一次调用同时返回语言标识和 3-5 句中文摘要
2. **沉浸式翻译**（仅英文文章）：调用 Claude 按段落翻译，输出为双语交替格式（英文原段引用 + 中文译段），保存为 `{id}.zh.md`
3. status 更新为 ready

#### 4.2.4 沉浸式翻译输出格式

翻译后的 Markdown 文件采用以下格式，前端直接渲染：

```markdown
> Original English paragraph here. This is the source text 
> that will be displayed in a blockquote style.

这是对应的中文翻译段落。翻译自然流畅，没有翻译腔。

> Next English paragraph continues here.

下一段的中文翻译在这里。
```

#### 4.2.5 错误处理

- Jina Reader 抓取失败：status 设为 error，记录 errorMessage，下次 cron 运行时不重试（避免无限循环）
- Claude API 调用失败：status 保持 fetched，下次运行自动重试
- 用户可在网页界面看到 error 状态的文章和错误信息

### 4.3 每日策展播客

#### 4.3.1 触发方式

GitHub Actions cron 定时触发，每天 UTC 23:00（对应北京时间早上 7:00）。

#### 4.3.2 生成流程

1. 筛选过去 24h 内 status = ready 的文章
2. 如果无文章，跳过本次生成
3. 汇总所有文章的标题、摘要、核心内容（截取前 3000 字）
4. 调用 Claude 生成中文策展总结
5. 调用 OpenAI TTS API 生成中文音频（分段调用，拼接为完整 MP3）
6. 上传 MP3 至阿里云 OSS：`readit/episodes/ep-{date}.mp3`
7. 更新 episodes.json，记录音频 URL 和元数据
8. git commit & push，触发 Pages 重新部署

#### 4.3.3 Prompt 设计指南

策展总结的 Claude Prompt 遵循以下原则：

- **输出语言**：纯中文
- **结构**：先用 2-3 句话概括今日主题，然后逐篇提炼核心观点，最后用 1-2 句话总结跨文章的关联洞察
- **语气**：简洁、信息密度高、播报风格，适合语音收听
- **长度**：控制在 800-1500 字，对应约 3-8 分钟音频

#### 4.3.4 TTS 技术细节

- 使用 OpenAI TTS API（tts-1 模型）
- 音色：待定（alloy / nova / shimmer，选定后固定）
- 长文本分段：按句号/段落切分，每段不超过 4096 字符
- 音频拼接：将多个 MP3 片段合并为单个文件
- 输出格式：MP3，标准比特率

### 4.4 阅读界面（GitHub Pages）

#### 4.4.1 设计风格

极简阅读向，参考 Reeder、Instapaper、Matter。纯静态 HTML，无框架依赖，系统字体，自动适配 Light/Dark Mode。

#### 4.4.2 页面结构

**首页（index.html）**

- 顶部：Readit 标题 + 最新策展入口（如有）
- 文章列表：按保存时间倒序，每篇显示标题、来源、时间、摘要预览
- 状态标记：pending / error 状态的文章显示对应标记
- 筛选：全部 / 本周 / 本月

**文章详情页（article.html?id=xxx）**

- 顶部：标题、来源、保存时间
- 摘要区域：淡色背景卡片，展示中文摘要
- 正文区域：
  - 英文文章：默认显示沉浸式双语（引用块 = 英文原文，正文 = 中文翻译），可切换"仅英文""仅中文""双语"
  - 中文文章：直接显示原文
- 底部：原文链接

**策展页（curation.html）**

- 策展列表：按日期倒序
- 每期：日期、文章数量、音频播放器、文字总结
- 音频播放器：播放/暂停、进度条、倍速（0.5x / 1x / 1.5x / 2x）
- 展开文字总结，可点击跳转到关联文章

#### 4.4.3 构建方式

`build-site.js` 脚本在每次 Action 运行后执行：

1. 读取 articles.json 和 episodes.json
2. 读取各文章的 Markdown 内容文件
3. 将数据注入 HTML 模板，生成静态页面
4. 输出到 `site/` 目录
5. GitHub Pages 自动部署

---

## 5. GitHub Actions Workflows

### 5.1 save-article.yml

- **触发**：`repository_dispatch` (event_type: save-article) + `workflow_dispatch`（手动输入 URL）
- **步骤**：checkout → npm install → 运行 save-article.js → commit & push → 触发 process-articles

### 5.2 process-articles.yml

- **触发**：`workflow_run`（save-article 完成后）+ `schedule`（每 30 分钟）
- **步骤**：checkout → npm install → 运行 process-articles.js → 运行 build-site.js → commit & push
- **超时**：30 分钟（GitHub Actions 默认上限 6 小时）

### 5.3 daily-curation.yml

- **触发**：`schedule`（cron: '0 23 * * *'，UTC 23:00 = 北京 07:00）+ `workflow_dispatch`（手动触发）
- **步骤**：checkout → npm install → 运行 daily-curation.js → 运行 build-site.js → commit & push

### 5.4 GitHub Secrets 配置

| Secret 名称 | 用途 |
|-------------|------|
| CLAUDE_API_KEY | Claude API 密钥 |
| OPENAI_API_KEY | OpenAI API 密钥 |
| OSS_ACCESS_KEY_ID | 阿里云 OSS AccessKey ID |
| OSS_ACCESS_KEY_SECRET | 阿里云 OSS AccessKey Secret |
| OSS_REGION | OSS Region（如 oss-cn-shanghai） |
| OSS_BUCKET | OSS Bucket 名称 |

iOS Shortcut 中需要存储的变量：GitHub Personal Access Token（Fine-grained，仅 contents: write 权限）。

---

## 6. 成本估算

### 6.1 API 成本

假设每天保存 10 篇文章，平均每篇 2000 字：

| API 调用 | 单次估算 | 每日估算 | 每月估算 |
|----------|----------|----------|----------|
| Jina Reader | 免费（1000次/月免费 tier） | ~10 次 | 免费 |
| 摘要（Claude） | ~2K tokens in + 200 out | ~22K tokens | ~$0.5 |
| 翻译（Claude） | ~2K tokens in + 2K out | ~40K tokens | ~$1 |
| 策展总结（Claude） | ~20K tokens in + 1K out | ~21K tokens | ~$0.5 |
| 策展 TTS（OpenAI） | ~1200 chars | ~1.2K chars | ~$0.3 |

**每月 API 成本：约 $2-3**（不含单篇文章 TTS，仅策展播客生成音频）。

### 6.2 基础设施成本

| 服务 | 成本 |
|------|------|
| GitHub Actions | 免费（公开 repo）或 2000 分钟/月（私有 repo 免费额度） |
| GitHub Pages | 免费 |
| 阿里云 OSS | 极低（每月几 MB 音频，费用 < ¥1） |

**总月成本：约 $2-3**，相比 v1 的 $6-8 显著降低（因为去掉了单篇文章 TTS）。

---

## 7. 开发路线图

### Phase 1 — 核心链路

**目标：跑通"保存 → 抓取 → 阅读"全流程**

- GitHub repo 初始化 + 数据结构
- save-article.js + save-article.yml
- process-articles.js（Jina Reader 抓取 + Claude 摘要/翻译）+ process-articles.yml
- build-site.js + 基础 HTML 页面（文章列表 + 详情）
- GitHub Pages 部署
- iOS Shortcut 制作

### Phase 2 — 每日策展

**目标：自动生成每日策展播客**

- daily-curation.js（Claude 总结 + OpenAI TTS + OSS 上传）
- daily-curation.yml（定时触发）
- 策展页面 + 音频播放器

### Phase 3 — 体验优化

**目标：打磨阅读和使用体验**

- 阅读界面美化（排版、字体、间距）
- 双语模式切换交互
- PWA 支持（添加到主屏幕，离线缓存已加载的文章）
- 文章搜索功能（客户端 JSON 搜索）

---

## 8. 约束与已知限制

- **无离线阅读**：依赖网页访问，无网络时不可用（Phase 3 可通过 PWA 部分缓解）
- **GitHub Actions 延迟**：定时任务有几分钟的调度延迟，文章保存后不会立即处理完成
- **GitHub Actions 限制**：私有 repo 免费额度 2000 分钟/月，每 30 分钟运行一次 process workflow 约消耗 ~1440 分钟/月，需要注意用量
- **Jina Reader 免费额度**：1000 次/月，每天 10 篇约 300 次/月，够用但需监控
- **GitHub Repo 大小**：文章内容为 Markdown 文本，增长缓慢；音频文件存在 OSS 不占 Repo 空间
- **无实时通知**：文章处理完成后没有推送通知，用户需要主动访问网页查看
- **单人使用**：GitHub PAT 认证，不支持多用户

---

## 9. 未来可拓展方向

- **PWA + Service Worker**：离线缓存已加载文章，添加到主屏幕获得类 App 体验
- **单篇文章 TTS**：在网页上点击按钮，触发 Action 生成单篇文章音频
- **RSS 输出**：将策展播客输出为 RSS feed，可在 Apple Podcasts / Spotify 收听
- **Telegram Bot**：作为保存入口的补充，发送链接给 Bot 保存文章
- **标签 / 分类**：文章自动打标签，按主题分组
- **阅读统计**：追踪已读/未读、阅读时间等数据
- **多源订阅**：自动从 RSS 源抓取新文章，不限于手动保存
