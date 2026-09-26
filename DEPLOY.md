# 部署

这是个纯静态站点，**构建产物已经提交在仓库里**，所以部署就是「把仓库放到能被 HTTP 访问的地方」——不用打包、不用装依赖、不用跑 CI。

只有改了 `data/domains.json` 需要重新生成页面时才用得上 Node（18 以上，Debian 12 自带的就够）。

三种方式，按推荐顺序：

| 方式 | 适合 | 难度 |
| --- | --- | --- |
| [自己的 VPS](#方式一自己的-vpsdebian-12--nginx) | 想完全自己掌控，或者想让 16 个域名各自打开自己的页面 | 中 |
| [Cloudflare Pages](#方式二cloudflare-pages) | 域名本来就在 Cloudflare，图省事 | 低 |
| [GitHub Pages](#方式三github-pages) | 只想两分钟先看到效果 | 最低 |

---

## 方式一：自己的 VPS（Debian 12 + nginx）

### 1. 装环境

```bash
apt update
apt install -y nginx git
```

### 2. 把站点拉下来

```bash
git clone https://github.com/doudoudoubao/yumingguanli.git /var/www/yuming
```

> 不用 `chown` 给 `www-data`。git 建出来的就是 `755/644`，nginx 只需要读权限。
> 反过来把仓库交给 `www-data`，之后 root 再跑 `git pull` 会被 git 以
> `detected dubious ownership` 拒绝。

### 3. 解析域名

在 Cloudflare 给域名加一条 A 记录指向 VPS 的 IP。

**先设成「仅 DNS」（灰色云朵）**，签完证书想开橙色云朵再开——橙色云朵下 certbot 的 HTTP 验证容易失败。

### 4. nginx 配置

仓库里有现成的：

```bash
cp /var/www/yuming/deploy/nginx.conf /etc/nginx/sites-available/yuming
```

打开改两处：`server_name` 换成你的域名，`root` 确认是 `/var/www/yuming`。然后：

```bash
ln -s /etc/nginx/sites-available/yuming /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

`nginx -t` 必须输出 `syntax is ok` 和 `test is successful` 才能继续。

### 5. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d 530.one -d www.530.one
```

certbot 会自己改好 443 的配置，并装一个 systemd timer 定时续期，不用额外操作。验证续期是否正常：

```bash
certbot renew --dry-run
```

装完如果要在 Cloudflare 开橙色云朵，**SSL/TLS 模式必须设成「完全（严格）」**，设成「灵活」会重定向死循环。

### 6. 装 Node（可选）

只有想在服务器上改内容、重新生成页面才需要：

```bash
apt install -y nodejs
node -v          # Debian 12 是 18.x，满足要求
```

---

### 进阶：让 16 个域名各自打开自己的页面

访问 `vps.bike` 直接打开 `/d/vps.bike/`，访问 `坤.eu.org` 打开它自己那页，主域名仍然显示总览。

主域名在 `data/domains.json` 的 `site.primaryDomain` 里设置（默认 `530.one`）。

```bash
# 1. 把所有域名的 A 记录都指向这台机器

# 2. 装上构建时生成的映射表
cp /var/www/yuming/deploy/domains.map /etc/nginx/conf.d/yuming-map.conf

# 3. 编辑 /etc/nginx/sites-available/yuming
#    把文件里注释掉的第二个 server 块取消注释，删掉第一个

nginx -t && systemctl reload nginx
```

`deploy/domains.map` 是构建时自动生成的，改完 `data/domains.json` 重新构建就会同步，不用手改。IDN 域名用的是 Punycode（浏览器发过来的 `Host` 就是这个形式）：

```
xn--tfs.eu.org   /d/kun.eu.org/;     # 坤.eu.org
```

证书要一次签多个域名：

```bash
certbot --nginx -d 530.one -d www.530.one -d vps.bike -d www.vps.bike -d gpt.tg ...
```

Let's Encrypt 单张证书最多 100 个域名，16 个域名 + www 是 32 个，一张就够。

---

## 方式二：Cloudflare Pages

Cloudflare 后台 → Workers & Pages → 连接这个 GitHub 仓库，配置：

| 项 | 填什么 |
| --- | --- |
| 框架预设 | None |
| 构建命令 | 留空（产物已提交；想重新生成就填 `npm run build`） |
| 构建输出目录 | `/` ← **是仓库根目录，不是 dist** |
| 生产分支 | `main`（或当前的功能分支） |

部署完在 Custom domains 里绑域名，DNS 在同一个账号下会自动配好。

---

## 方式三：GitHub Pages

Settings → Pages → Source 选 **Deploy from a branch**，分支选要发布的分支，目录选 **/ (root)**。仓库里已经有 `.nojekyll`。

> 用默认地址（`用户名.github.io/yumingguanli/`）时，**只有 404 页面的样式会丢**——它引用的是绝对路径 `/assets/`，在子路径下取不到。首页和 16 个域名页都正常。绑定自己的域名后这个问题不存在。

---

## 更新内容

改 `data/domains.json`，推上去，然后在服务器上：

```bash
bash /var/www/yuming/deploy/update.sh
```

这个脚本会拉代码、重新生成页面、同步 nginx 映射表（如果用了进阶版）、`nginx -t` 通过后重载，最后把属主交回 `www-data`。

Cloudflare Pages 和 GitHub Pages 是推送后自动部署的，不用管。

---

## 常见问题

**`nginx -t` 报 `unknown directive "map"`**
`map` 只能放在 `http` 块里。确认 `yuming-map.conf` 是在 `/etc/nginx/conf.d/` 下，不是 `sites-available/`。

**域名页面 404**
目录名不一定等于域名。IDN 域名用的是可读 slug：`i·kun.eu.org` → `d/ikun.eu.org/`、`坤.eu.org` → `d/kun.eu.org/`、`⋯.eu.org` → `d/dots.eu.org/`。完整对照见 `api/domains.json` 的 `path` 字段。

**改完 `domains.json` 页面没变**
生成产物是提交在仓库里的静态文件，必须跑 `node scripts/build.mjs` 重新生成。

**开了 Cloudflare 橙色云朵之后打不开 / 一直跳转**
SSL/TLS 模式改成「完全（严格）」。

**样式丢失**
多半是 `root` 路径不对，或者站点部署在子路径下。`ls /var/www/yuming/assets/` 确认文件在。
