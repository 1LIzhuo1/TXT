# 小说搜索与TXT下载（Cloudflare Worker）

这个项目是一个 Cloudflare Worker + 前端页面的简单应用：
- 输入书名与作者，尝试在公开资源中查找可用的 TXT 文本。
- 对抓取结果进行基础清理（去头尾、合并空行）。
- 提供可下载的 TXT 文件。

> 重要：本项目只抓取 **公开可访问** 的内容，不绕过付费/登录/版权限制。

## 一键部署思路（傻瓜操作版）

1. **安装依赖**
   ```bash
   npm install
   ```
2. **登录 Cloudflare**
   ```bash
   npx wrangler login
   ```
3. **本地预览**
   ```bash
   npm run dev
   ```
4. **部署到 Cloudflare**
   ```bash
   npm run deploy
   ```

部署后会给你一个公开网址，打开就是搜索页面。

## 搜索能力说明

默认使用 Open Library API（无需密钥），只能命中带有 Gutenberg 文本的书。
如果你需要更“深度”的网页搜索，可配置以下方式：

### 1) SerpAPI（推荐）
在 `wrangler.toml` 中设置：

```toml
[vars]
SEARCH_PROVIDER = "serpapi"
SERPAPI_KEY = "你的 SerpAPI Key"
```

### 2) Google Custom Search

```toml
[vars]
SEARCH_PROVIDER = "google_cse"
GOOGLE_CSE_ID = "你的 CSE ID"
GOOGLE_API_KEY = "你的 API Key"
```

### 3) 直接填写公开链接

在页面中输入 `公开文本链接`，系统会直接抓取并整理。

## 提醒

- 如果找不到文本来源，系统会提示你补充公开链接。
- 不建议抓取版权受保护的内容。
