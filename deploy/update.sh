#!/usr/bin/env bash
#
# 更新站点：拉代码 → 重新生成页面 → 同步 nginx 映射表 → 重载
#
#   bash deploy/update.sh
#
# 放进 crontab 就能定时更新（可选）：
#   0 5 * * * /var/www/yuming/deploy/update.sh >> /var/log/yuming-update.log 2>&1

set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
echo "==> 站点目录：$REPO"

echo "==> 拉取最新代码"
git pull --ff-only

# 产物本身也提交在仓库里，所以没装 Node 也能用，只是改了 domains.json 后无法重新生成
if command -v node >/dev/null 2>&1; then
    echo "==> 重新生成页面"
    node scripts/build.mjs
else
    echo "==> 跳过构建：未安装 Node（仓库里的产物仍然是可用的）"
fi

# 用了「一域名一页面」那套才需要同步 map
MAP_TARGET=/etc/nginx/conf.d/yuming-map.conf
if [ -f "$MAP_TARGET" ]; then
    echo "==> 同步 nginx 域名映射表"
    cp deploy/domains.map "$MAP_TARGET"
fi

if command -v nginx >/dev/null 2>&1; then
    echo "==> 检查 nginx 配置"
    nginx -t
    systemctl reload nginx
    echo "==> nginx 已重载"
fi

# 不用 chown 给 www-data：git 默认建出来就是 755/644，nginx 只读得到就够了。
# 反过来把仓库交给 www-data，root 再跑 git pull 会被 git 以「dubious ownership」拒绝。

echo "==> 完成"
