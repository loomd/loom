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
    # umask 必须限定在子 shell 内：077 会一路影响到后续步骤，使 certbot 创建的
    # ACME 校验目录变成 0700（root 独占），nginx worker 读不到挑战文件，
    # Let's Encrypt 校验时会收到 403。
    (
        umask 077
        printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
        printf 'CORS_ORIGIN=*\n' >> .env
        chmod 600 .env
    )
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
    local cert="$1" names n suffix label
    [ -f "$cert" ] || return 1

    # 首选 openssl -checkhost（OpenSSL ≥ 1.1.1，原生支持单层通配符）
    if openssl x509 -in "$cert" -noout -checkhost "$DOMAIN" >/dev/null 2>&1; then
        return 0
    fi

    # 兜底：旧版 openssl 不支持 -checkhost 时，手工匹配 SAN / CN
    names="$(openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null \
        | tr ',' '\n' | sed -n 's/.*DNS:\([^[:space:]]*\).*/\1/p')"
    [ -n "$names" ] || names="$(openssl x509 -in "$cert" -noout -subject 2>/dev/null \
        | sed -n 's/.*CN[[:space:]]*=[[:space:]]*//p')"

    for n in $names; do
        case "$n" in
            "$DOMAIN") return 0 ;;
            '*'*)
                # *.suffix 仅匹配单层子域：a.suffix 匹配；a.b.suffix 与 suffix 均不匹配
                suffix="${n#*.}"
                case "$DOMAIN" in
                    *".${suffix}") ;;
                    *) continue ;;
                esac
                label="${DOMAIN%".${suffix}"}"
                case "$label" in
                    ""|*.*) continue ;;
                esac
                return 0
                ;;
        esac
    done
    return 1
}

# ── 4.1 证书发现 ───────────────────────────────────────────────────────────
# 列出服务器上"可能已经在使用"的证书，每行 "证书路径<TAB>私钥路径"
find_server_certs() {
    local conf d f

    # (a) nginx 实际配置的证书 —— 最权威，直接反映这台服务器当前在用什么证书。
    #     服务器上已有 *.ccxcc.cn 泛域名证书时，这条路径能把它找出来。
    conf="$(mktemp)"
    if nginx -T >"$conf" 2>/dev/null; then
        awk '
            /^[[:space:]]*#/ { next }
            /ssl_certificate[ \t]+/ {
                line = $0
                sub(/^.*ssl_certificate[ \t]+/, "", line)
                gsub(/[;"]/, "", line)
                gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
                if (line != "" && line != "none") cert = line
                next
            }
            /ssl_certificate_key[ \t]+/ {
                line = $0
                sub(/^.*ssl_certificate_key[ \t]+/, "", line)
                gsub(/[;"]/, "", line)
                gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
                if (line != "" && line != "none" && cert != "") {
                    print cert "\t" line
                    cert = ""
                }
            }
        ' "$conf" | sort -u
        rm -f "$conf"
    fi

    # (b) Let's Encrypt 常规目录
    for d in /etc/letsencrypt/live/*/; do
        if [ -f "${d}fullchain.pem" ]; then
            printf '%s\t%s\n' "${d}fullchain.pem" "${d}privkey.pem"
        fi
    done

    # (c) acme.sh
    for f in /root/.acme.sh/*/*.fullchain.cer; do
        [ -f "$f" ] || continue
        printf '%s\t%s\n' "$f" "${f%.fullchain.cer}.key"
    done
}

# ── 5. 确保 TLS 证书存在 ────────────────────────────────────────────────────
ensure_cert() {
    if [ -e "$CERT_LINK" ] && [ -f "${CERT_LINK}/fullchain.pem" ] && cert_covers "${CERT_LINK}/fullchain.pem"; then
        log "证书已就绪: ${CERT_LINK}"
        return 0
    fi

    # 优先复用服务器上已有的证书（如 *.ccxcc.cn 泛域名），
    # 确认服务器上没有可用证书后，才走签发新证书的流程。
    local cert key
    while IFS=$'\t' read -r cert key; do
        [ -n "$cert" ] || continue
        [ -f "$cert" ] || continue
        cert_covers "$cert" || continue
        if [ ! -f "$key" ]; then
            log "证书 ${cert} 覆盖 ${DOMAIN}，但私钥 ${key} 不存在，跳过"
            continue
        fi
        log "复用服务器已有证书: ${cert}"
        # 软链到 nginx 站点引用的标准路径（不动原证书与私钥本身）
        if [ -L "$CERT_LINK" ]; then
            rm -f "$CERT_LINK"
        fi
        mkdir -p "$CERT_LINK"
        ln -sfn "$cert" "${CERT_LINK}/fullchain.pem"
        ln -sfn "$key" "${CERT_LINK}/privkey.pem"
        return 0
    done < <(find_server_certs)

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
    # 校验目录必须对 nginx worker 可遍历可读，否则 Let's Encrypt 拉取挑战文件会得到 403。
    # 目录若已存在且权限更严（如 0700），这里主动放开。
    chmod 755 "${ACME_WEBROOT}/.well-known" 2>/dev/null || true
    chmod 755 "${ACME_WEBROOT}/.well-known/acme-challenge" 2>/dev/null || true

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

# 提示其它同样声明了该域名的站点配置（仅告警，不改动他人配置；
# nginx 按 include 顺序取第一个匹配，conf.d 优先于 sites-enabled）
for f in "${NGINX_DIR}"/*.conf /etc/nginx/sites-enabled/*; do
    [ -f "$f" ] || continue
    case "$f" in
        "${NGINX_DIR}/loom-relay.conf") continue ;;
    esac
    if grep -E "server_name" "$f" 2>/dev/null | grep -qF "$DOMAIN"; then
        log "提示: ${f} 也声明了 ${DOMAIN}，请确认其与本中继的优先级"
    fi
done

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
