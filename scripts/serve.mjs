#!/usr/bin/env node
/** 本地预览用的极简静态服务器，零依赖：node scripts/serve.mjs [端口] */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  // decodeURIComponent 让带非 ASCII 的路径也能命中
  let rel = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let full = join(ROOT, rel);
  if (!full.startsWith(ROOT)) return null; // 防目录穿越

  try {
    const info = await stat(full);
    if (info.isDirectory()) full = join(full, "index.html");
    await stat(full);
    return full;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const file = (await resolveFile(req.url || "/")) || join(ROOT, "404.html");
  try {
    const buf = await readFile(file);
    const notFound = file.endsWith("404.html") && !(req.url || "").includes("404");
    res.writeHead(notFound ? 404 : 200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(buf);
  } catch {
    res.writeHead(500).end("500");
  }
}).listen(PORT, () => {
  console.log(`▲ http://localhost:${PORT}  (Ctrl+C 停止)`);
});
