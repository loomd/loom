#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Loom 自建中继 (Relay Server) —— 服务器端部署脚本（由 GitHub Actions 调用）
#
#   架构: nginx 终止 TLS (443) → 反向代理 → 127.0.0.1:9099 → relay 容器 (8443 明文)
#   对外: https://agent.ccxcc.cn   (WebSocket: wss://agent.ccxcc.cn/ws/desktop)
#
#   入口: .github/workflows/relay.yml → ssh-action → bash relay/deploy.sh
#
#   可用环境变量覆盖:
#     APP_DIR      部署目录      (默认 /opt/loom-relay)
#     DOMAIN       对外域名      (默认 agent.ccxcc.cn)
#     REPO_URL     仓库地址      (默认 https://github.com/loomd/loom.git)
#     ACME_EMAIL   证书注册邮箱  (可选，缺省则无邮箱注册)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/loom-relay}"
DOMAIN="${DOMAIN:-agent.ccxcc.cn}"
REPO_URL="${REPO_URL:-https://github.com/loomd/loom.git}"
ACME_EMAIL="${ACME_EMAIL:-}"
CERT_LINK="/etc/letsencrypt/live/${DOMAIN}"
ACME_WEBROOT="/var/www/html"
NGINX_DIR="/etc/nginx/conf.d"

log()  { echo "==> $*"; }
fail() { echo "!! $*" >&2; exit 1; }

# ── 0. 前置依赖 ─────────────────────────────────────────────────────────────
for cmd in docker nginx openssl curl git; do
    command -v "$cmd" >/dev/null 2>&1 || fail "缺少依赖命令: $cmd"
done
docker compose version >/dev/null 2>&1 || fail "缺少 docker compose 插件"

# ── 1. 同步代码 ──────────────────────────────────────────────────────────────
log "同步代码到 ${APP_DIR}"
mkdir -p "$APP_DIR"
cd "$APP_DIR"
if [ -d ".git" ]; then
    git fetch origin main
    git reset --hard origin/main
else
    git clone "$REPO_URL" .
fi
cd relay

# ── 2. 准备 .env (JWT 密钥) ─────────────────────────────────────────────────
if [ ! -f .env ]; then
    log "生成 relay/.env 与随机 JWT_SECRET"
    umask 077
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
    printf 'CORS_ORIGIN=*\n' >> .env
    chmod 600 .env
else
    log "relay/.env 已存在，沿用现有 JWT_SECRET"
fi

# ── 3. 启动 relay 容器 (仅绑定回环) ──────────────────────────────────────────
log "启动 relay 容器 (127.0.0.1:9099 -> 8443)"
docker compose down || true
docker compose up -d --build
docker compose ps

# ── 4. nginx 辅助函数 ───────────────────────────────────────────────────────
reload_nginx() {
    nginx -t || fail "nginx 配置校验失败，未重载（详见上方错误）"
    systemctl reload nginx
    log "nginx 已重载"
}

install_vhost() {
    install -d "$NGINX_DIR"
    install -m 644 "$1" "$NGINX_DIR/$2"
}

# 证书是否覆盖当前域名
cert_covers() {
    openssl x509 -in "$1" -noout -checkhost "$DOMAIN" >/dev/null 2>&1
}

# ── 5. 确保 TLS 证书存在 ────────────────────────────────────────────────────
ensure_cert() {
    if [ -e "$CERT_LINK" ] && [ -f "${CERT_LINK}/fullchain.pem" ] && cert_covers "${CERT_LINK}/fullchain.pem"; then
        log "证书已就绪: ${CERT_LINK}"
        return 0
    fi

    # 复用已有的 Let's Encrypt 证书（如 *.ccxcc.cn 泛域名），软链到标准路径
    for d in /etc/letsencrypt/live/*/; do
        if [ -f "${d}fullchain.pem" ] && cert_covers "${d}fullchain.pem"; then
            log "复用现有证书: ${d%/}"
            mkdir -p "$(dirname "$CERT_LINK")"
            ln -sfn "${d%/}" "$CERT_LINK"
            return 0
        fi
    done

    # 复用 acme.sh 签发的证书
    for f in /root/.acme.sh/*/*.fullchain.cer; do
        [ -f "$f" ] || continue
        if cert_covers "$f"; then
            log "复用 acme.sh 证书: ${f}"
            mkdir -p "$CERT_LINK"
            cp -f "$f" "${CERT_LINK}/fullchain.pem"
            cp -f "${f%.fullchain.cer}.key" "${CERT_LINK}/privkey.pem"
            chmod 600 "${CERT_LINK}/privkey.pem"
            return 0
        fi
    done

    # 没有可用证书 → 先装只监听 80 的 ACME 校验站点，再由 certbot 签发
    log "未找到覆盖 ${DOMAIN} 的证书，签发新证书"
    command -v certbot >/dev/null 2>&1 || {
        log "安装 certbot"
        apt-get update -qq && apt-get install -y -qq certbot
    }
    mkdir -p "${ACME_WEBROOT}/.well-known/acme-challenge"

    # 仅 80 端口的临时校验站点，避免 443 引用不存在的证书导致 nginx -t 失败
    rm -f "${NGINX_DIR}/loom-relay.conf"
    install_vhost nginx/loom-relay-acme.conf loom-relay-acme.conf
    reload_nginx

    if [ -n "$ACME_EMAIL" ]; then
        certbot certonly --webroot -w "$ACME_WEBROOT" --cert-name "$DOMAIN" \
            -d "$DOMAIN" --non-interactive --agree-tos -m "$ACME_EMAIL"
    else
        certbot certonly --webroot -w "$ACME_WEBROOT" --cert-name "$DOMAIN" \
            -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
    fi

    # 续期定时器（Ubuntu 官方 certbot 包自带，确保其处于启用状态）
    systemctl enable --now certbot.timer >/dev/null 2>&1 || true
}

ensure_cert

# ── 6. 安装正式站点 (443 TLS) ───────────────────────────────────────────────
log "安装 nginx TLS 站点"
rm -f "${NGINX_DIR}/loom-relay-acme.conf"
install_vhost nginx/loom-relay.conf loom-relay.conf
reload_nginx

# ── 7. HTTPS 存活探测 ───────────────────────────────────────────────────────
log "HTTPS 存活探测: https://${DOMAIN}/api/health"
for i in $(seq 1 10); do
    if curl -fsS --max-time 10 "https://${DOMAIN}/api/health"; then
        echo ""
        log "部署完成: https://${DOMAIN}"
        exit 0
    fi
    echo "    等待服务就绪 (${i}/10)..."
    sleep 3
done

fail "健康检查未通过，请检查: docker compose ps / nginx -t / journalctl -u nginx"
