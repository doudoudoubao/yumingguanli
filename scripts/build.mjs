#!/usr/bin/env node
/**
 * 域名矩阵 — 静态站点生成器
 *
 * 读取 data/domains.json，输出：
 *   index.html                 总览页
 *   d/<slug>/index.html        每个域名的独立页面
 *   404.html                   找不到页面时的兜底
 *   api/domains.json           规范化之后的数据（方便别处直接取用）
 *
 * 零依赖，直接 `node scripts/build.mjs` 即可。
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, domainToASCII } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data", "domains.json");

/* -------------------------------------------------------------------------- */
/* 工具函数                                                                    */
/* -------------------------------------------------------------------------- */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** 需要整体当作后缀看待的二级域 */
const MULTI_SUFFIX = ["eu.org", "co.uk", "com.cn", "net.cn", "org.cn", "com.br", "co.jp"];

function tldOf(name) {
  const lower = name.toLowerCase();
  const hit = MULTI_SUFFIX.find((s) => lower.endsWith("." + s));
  return hit || lower.slice(lower.lastIndexOf(".") + 1);
}

/** 主体部分（去掉后缀），用于展示 */
function labelOf(name) {
  const tld = tldOf(name);
  return name.slice(0, name.length - tld.length - 1);
}

/** 字符串 -> 0..359 的色相，同一个域名永远拿到同一个颜色 */
function hueOf(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  // 乘黄金角，让相邻的哈希值也能拉开距离
  return Math.round((h * 137.508) % 360);
}

/** 让所有色相两两至少相隔 minGap 度，避免两张卡片撞色 */
function spreadHues(hues, minGap = 16) {
  const out = hues.slice();
  const order = out.map((h, i) => [h, i]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1][0];
    if (order[i][0] - prev < minGap) order[i][0] = (prev + minGap) % 360;
  }
  order.forEach(([h, i]) => (out[i] = Math.round(h) % 360));
  return out;
}

/** 普通的字符串哈希，用来派生各种「每个域名都不一样」的视觉参数 */
function hashOf(str) {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 水印文字的宽度（单位 em）。等宽字体下 CJK 算一个全角，ASCII 算 0.6 */
function emWidth(text) {
  let em = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6);
    em += wide ? 1 : 0.6;
  }
  return Math.max(Math.round(em * 100) / 100, 0.6);
}

/**
 * 每个域名的视觉签名：主色相之外再给一个副色相、一种底纹、一个渐变角度，
 * 加上主体文字做的大水印。这样 16 个页面不只是换个颜色，而是各有各的样子。
 */
const MOTIF_COUNT = 8;

function signatureOf(d) {
  const h = hashOf(d.name);
  return {
    hue2Offset: 28 + (h % 62), // 副色相和主色相的间距
    // 底纹按顺序轮流分配，保证 8 种全都用上、相邻两张卡片也永远不一样；
    // 用哈希取模的话 16 个域名会挤在少数几种上。
    motif: d.i % MOTIF_COUNT,
    // 注意用无符号右移：h 可能大于 2^31，有符号右移会变成负数。
    wash: 110 + ((h >>> 3) % 90),
    wmEm: emWidth(d.label),
  };
}

/** 目录名用的 slug：ASCII 域名直接用自身，IDN 回落到 punycode */
function slugOf(d) {
  if (d.slug) return d.slug;
  if (/^[a-z0-9.-]+$/i.test(d.name)) return d.name.toLowerCase();
  const ascii = domainToASCII(d.name);
  return ascii || encodeURIComponent(d.name);
}

const pad2 = (n) => String(n).padStart(2, "0");

/* -------------------------------------------------------------------------- */
/* 图标                                                                        */
/* -------------------------------------------------------------------------- */

const ICON = {
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M5.6 5.6 4 4M20 20l-1.6-1.6M18.4 5.6 20 4M4 20l1.6-1.6"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M5 15V5.6A1.6 1.6 0 0 1 6.6 4H15"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M19 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5h4.5"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.4"/></svg>`,
  dns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4a14 14 0 0 1 0 17.2 14 14 0 0 1 0-17.2"/></svg>`,
};

/* -------------------------------------------------------------------------- */
/* 页面骨架                                                                    */
/* -------------------------------------------------------------------------- */

/** 主题记忆脚本，放在 head 里避免刷新时闪白 */
const THEME_BOOT = `<script>(function(){try{var t=localStorage.getItem('dm-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;

function layout({ title, description, base, hue, rootVars, body, bodyAttrs = "", scripts = [] }) {
  return `<!doctype html>
<html lang="zh-CN"${rootVars ? ` style="${rootVars}"` : hue != null ? ` style="--accent-h:${hue}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark light">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='hsl(${hue ?? 265} 92%25 66%25)'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}assets/styles.css">
${THEME_BOOT}
</head>
<body${bodyAttrs}>
<div class="bg" aria-hidden="true"></div>
<div class="grain" aria-hidden="true"></div>
${body}
${scripts.map((s) => `<script src="${base}${s}" defer></script>`).join("\n")}
</body>
</html>
`;
}

function topbar(base, { home = false } = {}) {
  return `<header class="topbar">
  <div class="wrap topbar__inner">
    <a class="brand" href="${base}index.html"${home ? ` aria-current="page"` : ""}>
      <span class="brand__dot" aria-hidden="true"></span>
      <span>域名矩阵</span>
      <span class="brand__en" aria-hidden="true">DOMAIN&nbsp;INDEX</span>
    </a>
    <div class="topbar__spacer"></div>
    ${
      home
        ? `<button class="iconbtn" data-view-toggle type="button" aria-label="切换到列表视图">
      <span data-icon-list>${ICON.list}</span><span data-icon-grid style="display:none">${ICON.grid}</span>
    </button>`
        : `<a class="iconbtn" href="${base}index.html">${ICON.grid}<span class="hide-sm">总览</span></a>`
    }
    <button class="iconbtn" data-theme-toggle type="button" aria-label="切换深色 / 浅色主题">
      <span class="only-dark">${ICON.sun}</span><span class="only-light">${ICON.moon}</span>
    </button>
  </div>
</header>`;
}

function footer(site, base) {
  return `<footer class="footer wrap">
  <span>${esc(site.footer || "")}</span>
  <span class="footer__mono"><a href="${base}api/domains.json">api/domains.json</a></span>
</footer>`;
}

/* -------------------------------------------------------------------------- */
/* 总览页                                                                      */
/* -------------------------------------------------------------------------- */

/** 把一个域名的视觉签名写成内联 CSS 变量 */
function styleVars(d) {
  return `--accent-h:${d.hue};--accent-h2:${d.hue2};--wash:${d.wash}deg;--wm-em:${d.wmEm}`;
}

function card(d) {
  const search = [d.name, d.ascii, d.label, d.tld, d.category, d.tagline, ...(d.tags || [])]
    .join(" ")
    .toLowerCase();

  return `  <a class="card tint reveal" href="d/${esc(d.slug)}/" style="${styleVars(d)};animation-delay:${Math.min(d.i * 35, 520)}ms"
     data-name="${esc(d.name)}" data-order="${d.i}" data-tld="${esc(d.tld)}"
     data-tags="${esc((d.tags || []).join("|"))}" data-search="${esc(search)}">
    <span class="motif motif--${d.motif}" aria-hidden="true"></span>
    <span class="card__wm" aria-hidden="true">${esc(d.label)}</span>
    <div class="card__top">
      <span class="card__idx">${pad2(d.i + 1)}</span>
      <span class="card__tld">.${esc(d.tld)}</span>
    </div>
    <div class="card__name">${esc(d.name)}</div>
    <p class="card__tag">${esc(d.tagline || "")}</p>
    <div class="card__foot">
      <span class="dot" aria-hidden="true"></span>
      <span class="card__foot-text">${esc(d.category || "域名")}</span>
      <span class="card__arrow" aria-hidden="true">${ICON.arrow}</span>
    </div>
  </a>`;
}

function buildIndex(site, domains) {
  const tagCount = new Map();
  domains.forEach((d) => (d.tags || []).forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"));

  const tldCount = new Set(domains.map((d) => d.tld)).size;
  const shortest = domains.reduce((a, b) => (a.name.length <= b.name.length ? a : b));

  const body = `${topbar("", { home: true })}
<main>
  <section class="hero wrap">
    <span class="hero__eyebrow"><span class="dot" aria-hidden="true"></span>共 ${domains.length} 个域名 · 解析在 Cloudflare</span>
    <h1 class="hero__title"><span class="grad">${esc(site.title)}</span></h1>
    <p class="hero__sub">${esc(site.subtitle)}</p>
    <div class="stats">
      <div class="stat"><div class="stat__n">${domains.length}</div><div class="stat__l">域名总数</div></div>
      <div class="stat"><div class="stat__n">${tldCount}</div><div class="stat__l">后缀种类</div></div>
      <div class="stat"><div class="stat__n">${shortest.name.length}</div><div class="stat__l">最短字符</div></div>
      <div class="stat"><div class="stat__n">${tags.length}</div><div class="stat__l">标签</div></div>
    </div>
  </section>

  <section class="controls">
    <div class="wrap">
      <div class="searchrow">
        <div class="search">
          ${ICON.search}
          <input id="search" type="search" placeholder="搜索域名、后缀或标签…" autocomplete="off" spellcheck="false" aria-label="搜索域名">
          <kbd class="hide-sm">/</kbd>
        </div>
        <select id="sort" class="select" aria-label="排序方式">
          <option value="default">默认顺序</option>
          <option value="name">按字母</option>
          <option value="length">按长度</option>
          <option value="tld">按后缀</option>
        </select>
      </div>
      <div class="chips" role="group" aria-label="按标签筛选">
        ${tags
          .map(
            ([t, n]) =>
              `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}<span class="chip__n">${n}</span></button>`
          )
          .join("\n        ")}
      </div>
    </div>
  </section>

  <div class="wrap">
    <div class="meta-line">
      <span>全部域名 / ALL</span>
      <span>显示 <span id="count">${domains.length}</span> / ${domains.length}</span>
    </div>
    <div class="grid" id="grid">
${domains.map(card).join("\n")}
    </div>
    <div class="empty" id="empty">没有匹配的域名，换个关键词试试。</div>
  </div>
</main>
${footer(site, "")}`;

  return layout({
    title: `${site.title} · ${domains.length} 个域名`,
    description: `${site.subtitle}，收录 ${domains.map((d) => d.name).slice(0, 6).join("、")} 等 ${domains.length} 个域名。`,
    base: "",
    hue: null,
    body,
    scripts: ["assets/site.js", "assets/index.js"],
  });
}

/* -------------------------------------------------------------------------- */
/* 域名详情页                                                                  */
/* -------------------------------------------------------------------------- */

function kvItem(k, v) {
  const empty = v === undefined || v === null || v === "";
  return `      <div class="kv__item"><div class="kv__k">${esc(k)}</div><div class="kv__v${empty ? " is-empty" : ""}">${esc(empty ? "待补充" : v)}</div></div>`;
}

function buildDomain(site, domains, d) {
  const base = "../../";
  const prev = domains[(d.i - 1 + domains.length) % domains.length];
  const next = domains[(d.i + 1) % domains.length];
  const url = `https://${d.ascii || d.name}`;

  const body = `${topbar(base)}
<main class="wrap">
  <nav class="crumb" aria-label="面包屑">
    <a href="${base}index.html">总览</a>
    <span aria-hidden="true">/</span>
    <b>${esc(d.name)}</b>
    <span aria-hidden="true">·</span>
    <span>${pad2(d.i + 1)} / ${pad2(domains.length)}</span>
  </nav>

  <article class="detail">
    <section class="stage reveal">
      <span class="motif motif--${d.motif}" aria-hidden="true"></span>
      <span class="stage__wm" aria-hidden="true">${esc(d.label)}</span>
      <div class="stage__body">
        <div class="detail__idx">DOMAIN ${pad2(d.i + 1)} / ${pad2(domains.length)}</div>
        <h1 class="detail__name">${esc(d.name)}</h1>
        ${
          d.ascii && d.ascii !== d.name
            ? `<div class="detail__ascii">Punycode · ${esc(d.ascii)}</div>`
            : ""
        }
        <p class="detail__tagline">${esc(d.tagline || "")}</p>
        <div class="stage__spec">
          <span>.${esc(d.tld)}</span><span aria-hidden="true">·</span>
          <span>${d.name.length} 字符</span><span aria-hidden="true">·</span>
          <span>${esc(d.category || "域名")}</span>
        </div>
        <div class="tags">
          ${(d.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("\n          ")}
        </div>
      </div>
    </section>

    <div class="actions reveal" style="animation-delay:120ms">
      <a class="btn btn--primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ICON.external}访问站点</a>
      <button class="btn" type="button" data-copy="${esc(d.name)}">${ICON.copy}复制域名</button>
      <a class="btn" href="https://who.is/whois/${esc(d.ascii || d.name)}" target="_blank" rel="noopener noreferrer">${ICON.info}WHOIS</a>
      <a class="btn" href="https://dns.google/query?name=${esc(d.ascii || d.name)}" target="_blank" rel="noopener noreferrer">${ICON.dns}DNS 查询</a>
    </div>

    ${
      d.review
        ? `<div class="notice">${ICON.info}<span>${esc(d.review)}。修改 <code>data/domains.json</code> 后重新构建即可更新。</span></div>`
        : ""
    }

    <section class="panelbox">
      <div class="panelbox__head">基本信息 / OVERVIEW</div>
      <div class="kv">
${kvItem("主体", d.label)}
${kvItem("后缀", "." + d.tld)}
${kvItem("总长度", d.name.length + " 字符")}
${kvItem("分类", d.category)}
${kvItem("解析平台", d.dns)}
${kvItem("注册商", d.registrar)}
${kvItem("到期时间", d.expires)}
${kvItem("状态", d.status === "active" ? "使用中" : d.status)}
      </div>
    </section>

    <section class="panelbox">
      <div class="panelbox__head">说明 / NOTES</div>
      <div class="prose"><p>${esc(d.note || d.tagline || "")}</p></div>
    </section>

    <section class="panelbox">
      <div class="panelbox__head">全部域名 / SWITCH</div>
      <nav class="rail" aria-label="其他域名">
        ${domains
          .map(
            (o) =>
              `<a class="tint" href="${base}d/${esc(o.slug)}/"${o.slug === d.slug ? ' aria-current="page"' : ""} style="--accent-h:${o.hue};--accent-h2:${o.hue2}">${esc(o.name)}</a>`
          )
          .join("\n        ")}
      </nav>
    </section>

    <nav class="pager" aria-label="上一个 / 下一个">
      <a href="${base}d/${esc(prev.slug)}/" rel="prev"><span class="pager__l">← 上一个</span><span class="pager__v">${esc(prev.name)}</span></a>
      <a href="${base}d/${esc(next.slug)}/" rel="next"><span class="pager__l">下一个 →</span><span class="pager__v">${esc(next.name)}</span></a>
    </nav>
  </article>
</main>
${footer(site, base)}`;

  return layout({
    title: `${d.name} · ${site.title}`,
    description: `${d.name} — ${d.tagline || ""} ${d.note || ""}`.trim().slice(0, 150),
    base,
    hue: d.hue,
    rootVars: styleVars(d),
    bodyAttrs: ` data-prev="${base}d/${esc(prev.slug)}/" data-next="${base}d/${esc(next.slug)}/"`,
    body,
    scripts: ["assets/site.js"],
  });
}

/* -------------------------------------------------------------------------- */
/* 404                                                                         */
/* -------------------------------------------------------------------------- */

function build404(site) {
  const body = `${topbar("")}
<main class="wrap center-page">
  <h1>404</h1>
  <p>这个地址下面没有域名。</p>
  <a class="btn btn--primary" href="/index.html">${ICON.arrow}回到总览</a>
</main>`;
  return layout({
    title: `404 · ${site.title}`,
    description: "页面不存在",
    base: "/",
    hue: 265,
    body,
    scripts: ["assets/site.js"],
  });
}

/* -------------------------------------------------------------------------- */
/* nginx 域名映射表                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 生成 nginx 的 map 片段：访问 vps.bike 直接打开它自己的展示页。
 * 浏览器对 IDN 域名发送的 Host 是 Punycode，所以这里用 ascii 做 key。
 * site.primaryDomain 指定的那个域名不写进去，留给它显示总览页。
 */
function buildNginxMap(site, domains) {
  const primary = (site.primaryDomain || "").toLowerCase();
  const primaryAscii = primary ? domainToASCII(primary) || primary : "";

  const rows = [];
  for (const d of domains) {
    const host = (d.ascii || d.name).toLowerCase();
    if (host === primaryAscii) continue;
    // Punycode 的 host 看不出是哪个域名，给它标一行注释
    const note = host === d.name.toLowerCase() ? "" : d.name;
    rows.push([host, `/d/${d.slug}/`, note]);
    rows.push([`www.${host}`, `/d/${d.slug}/`, ""]);
  }

  const kw = Math.max(0, ...rows.map((r) => r[0].length));
  const vw = Math.max(0, ...rows.map((r) => r[1].length + 1));
  const lines = rows.map(([host, path, note]) => {
    const entry = `    ${host.padEnd(kw)}  ${path};`;
    return note ? `${entry.padEnd(kw + vw + 6)}  # ${note}` : entry;
  });

  return `# 由 scripts/build.mjs 生成，请勿手改 —— 改 data/domains.json 后重新构建。
#
# 放到 /etc/nginx/conf.d/yuming-map.conf（map 必须在 http 块里，
# Debian 的 /etc/nginx/nginx.conf 默认 include 了 conf.d/*.conf）。
#
# 主域名（显示总览页）：${primary || "未设置，见 data/domains.json 的 site.primaryDomain"}

map $host $domain_page {
    default  "";
${lines.join("\n")}
}
`;
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                      */
/* -------------------------------------------------------------------------- */

function write(relPath, content) {
  const full = join(ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  return relPath;
}

function main() {
  const raw = JSON.parse(readFileSync(DATA, "utf8"));
  const site = raw.site || {};
  const list = raw.domains || [];

  if (!list.length) {
    console.error("data/domains.json 里没有域名。");
    process.exit(1);
  }

  const hues = spreadHues(list.map((d) => hueOf(d.name)));

  const domains = list.map((d, i) => {
    const base = {
      ...d,
      i,
      slug: slugOf(d),
      ascii: domainToASCII(d.name) || "",
      tld: tldOf(d.name),
      label: labelOf(d.name),
      hue: hues[i],
      tags: d.tags || [],
    };
    const sig = signatureOf(base);
    return { ...base, ...sig, hue2: (base.hue + sig.hue2Offset) % 360 };
  });

  // slug 撞车会导致页面互相覆盖，直接报错更安全
  const seen = new Map();
  for (const d of domains) {
    if (seen.has(d.slug)) {
      console.error(`slug 冲突：${d.name} 与 ${seen.get(d.slug)} 都是 "${d.slug}"，请在 data/domains.json 里手动指定 slug。`);
      process.exit(1);
    }
    seen.set(d.slug, d.name);
  }

  // 清掉上一次生成的详情页，避免删域名之后留下孤儿目录
  const dDir = join(ROOT, "d");
  if (existsSync(dDir)) rmSync(dDir, { recursive: true, force: true });

  const written = [];
  written.push(write("index.html", buildIndex(site, domains)));
  for (const d of domains) {
    written.push(write(join("d", d.slug, "index.html"), buildDomain(site, domains, d)));
  }
  written.push(write("404.html", build404(site)));
  written.push(
    write(
      join("api", "domains.json"),
      JSON.stringify(
        {
          site,
          count: domains.length,
          domains: domains.map(({ i, ...rest }) => ({ index: i + 1, ...rest, path: `/d/${rest.slug}/` })),
        },
        null,
        2
      ) + "\n"
    )
  );
  written.push(write(join("deploy", "domains.map"), buildNginxMap(site, domains)));
  write(".nojekyll", "");

  console.log(`✓ 生成 ${written.length} 个文件，共 ${domains.length} 个域名`);
  for (const d of domains) console.log(`  ${pad2(d.i + 1)}  ${d.name.padEnd(16)} → d/${d.slug}/`);
}

main();
