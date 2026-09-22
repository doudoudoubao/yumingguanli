# 域名矩阵 · Domain Index

一个域名总览 + 独立展示页的静态站点。结构就是要求里的「总 - 域名1 - 域名2 ……」：

```
/                      总览：16 个域名的卡片墙，可搜索、筛选、排序
/d/530.one/            域名 1 的独立页面
/d/559911.xyz/         域名 2 的独立页面
...                    每个域名一个页面，共 16 个
```

纯静态、零依赖、不用打包工具，Node 18+ 跑一条命令就能生成全部页面。

## 功能

**总览页**

- 16 张卡片，每个域名有自己的专属色（由域名字符串哈希得到，颜色固定不变）
- 实时搜索：域名、后缀、标签、说明一起匹配，`/` 聚焦搜索框，`Esc` 清空
- 标签筛选：国别域 / eu.org / 四字母 / IDN / 极短 …… 点一下筛选，再点取消
- 排序：默认顺序、按字母、按长度、按后缀
- 网格 / 列表两种视图，选择会记在浏览器里
- 深色 / 浅色主题切换，同样会记住

**域名详情页**

- 超大域名标题 + 该域名的专属配色
- IDN 域名会同时显示 Punycode（比如 `坤.eu.org` → `xn--tfs.eu.org`）
- 一键复制域名、访问站点、WHOIS 查询、DNS 查询
- 基本信息表：主体、后缀、长度、分类、解析平台、注册商、到期时间、状态
- 底部可以直接跳到其他任意域名，`←` `→` 方向键翻上一个 / 下一个

## 改内容

所有内容都在 `data/domains.json` 里，改完重新构建即可：

```bash
npm run build      # 或 node scripts/build.mjs
```

加一个域名，往 `domains` 数组里追加一项：

```json
{
  "name": "example.com",
  "category": "国别域",
  "tags": ["短域名", "国别域"],
  "tagline": "卡片上显示的一句话。",
  "note": "详情页「说明」里的正文。",
  "status": "active",
  "dns": "Cloudflare",
  "registrar": "",
  "expires": ""
}
```

| 字段 | 说明 |
| --- | --- |
| `name` | 域名本体，支持中文和特殊字符，必填 |
| `slug` | 页面目录名，可选。非 ASCII 域名建议手动指定一个好看的，否则会回落到 Punycode |
| `category` | 分类，显示在卡片底部和详情页 |
| `tags` | 标签数组，总览页的筛选按钮由它自动生成 |
| `tagline` | 一句话简介，显示在卡片上 |
| `note` | 详情页的说明正文 |
| `registrar` / `expires` | 注册商和到期时间，留空会显示「待补充」 |

站点标题、副标题、页脚文案在同一个文件的 `site` 字段里。

`registrar`、`expires` 目前都是空的 —— 截图里看不到这些信息，没有替你编。补上之后重新构建就会显示。

另外 `⋯.eu.org` 这一个：截图里字符很小，我按省略号录入的，具体码位建议你对照 Cloudflare 后台再核一下，改 `name` 字段即可。

## 本地预览

```bash
npm run dev        # 构建 + 起本地服务器，默认 http://localhost:4173
```

## 部署

生成的文件直接就在仓库根目录，推上去即可：

- **GitHub Pages**：Settings → Pages → Deploy from a branch，选本分支 `/ (root)`。已经带了 `.nojekyll`
- **Cloudflare Pages**：构建命令 `npm run build`，输出目录留空（根目录）
- **任意静态托管 / 自己的 VPS**：把整个仓库丢进去就行，没有任何运行时依赖

## 目录结构

```
data/domains.json     ← 唯一的数据源，改这个
scripts/build.mjs     ← 生成器，零依赖
scripts/serve.mjs     ← 本地预览服务器
assets/styles.css     ← 样式
assets/site.js        ← 主题、复制、键盘翻页
assets/index.js       ← 总览页的搜索 / 筛选 / 排序 / 视图切换

index.html            ← 以下都是生成产物，不用手改
d/<域名>/index.html
404.html
api/domains.json      ← 规范化后的数据，别处想直接取用可以读它
```
