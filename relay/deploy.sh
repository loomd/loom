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
#
#   证书策略: 本脚本不签发证书，直接复用服务器上 nginx 已配置的证书
#   （覆盖 ${DOMAIN} 的 *.ccxcc.cn 泛域名证书即可）。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/loom-relay}"
DOMAIN="${DOMAIN:-agent.ccxcc.cn}"
REPO_URL="${REPO_URL:-https://github.com/loomd/loom.git}"
CERT_LINK="/etc/letsencrypt/live/${DOMAIN}"
NGINX_SITE_DIRS="/etc/nginx/conf.d /etc/nginx/sites-enabled"

log()  { echo "==> $*"; }
fail() { echo "!! $*" >&2; exit 1; }

# 去除首尾空白（read 的 IFS 会自动吃掉首尾空白）
trim() {
    local s
    IFS=$' \t\n' read -r s <<<"$1"
    printf '%s' "$s"
}

# ── 0. 前置依赖 ─────────────────────────────────────────────────────────────
for cmd in docker nginx openssl curl git; do
    command -v "$cmd" >/dev/null 2>&1 || fail "缺少依赖命令: $cmd"
done
docker compose version >/dev/null 2>&1 || fail "缺少 docker compose 插件"

# 站点安装目录：取 nginx.conf 实际 include 的那个目录。
# 不同发行版/面板的 nginx.conf 只 include conf.d 或只 include sites-enabled，
# 装错目录会导致配置静默不生效。
NGINX_DIR=""
for d in $NGINX_SITE_DIRS; do
    [ -d "$d" ] || continue
    if grep -qE "^[[:space:]]*include[[:space:]]+[^;]*${d}" /etc/nginx/nginx.conf 2>/dev/null; then
        NGINX_DIR="$d"
        break
    fi
done
[ -n "$NGINX_DIR" ] || NGINX_DIR="/etc/nginx/conf.d"
log "nginx 站点安装目录: ${NGINX_DIR}"

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
    # umask 限定在子 shell 内，避免影响脚本后续步骤
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

# 自检：打印 nginx 的 include 路径与已安装的站点文件，
# 便于确认 conf.d 下的配置是否真的会被加载
dump_nginx_include() {
    log "nginx include 路径（/etc/nginx/nginx.conf）:"
    grep -nE '^[[:space:]]*include[[:space:]]' /etc/nginx/nginx.conf 2>/dev/null | head -20 >&2 || true
    log "已安装的站点文件（${NGINX_DIR}）:"
    ls -1 "${NGINX_DIR}" 2>/dev/null >&2 || true
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
#
# 纯 bash 逐行解析 nginx -T 的输出，不依赖 awk/sed，避免各版本实现差异。
find_server_certs() {
    local conf line cert="" key="" value f

    conf="$(mktemp)"
    if nginx -T >"$conf" 2>/dev/null; then
        echo "==> [证书发现] nginx -T 输出 $(wc -l <"$conf") 行" >&2
    else
        echo "==> [证书发现] nginx -T 失败，直接扫描 nginx 配置目录" >&2
        : >"$conf"
        for f in /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/* /etc/nginx/snippets/*.conf; do
            [ -f "$f" ] || continue
            echo "# $f" >>"$conf"
            cat "$f" >>"$conf"
        done
    fi

    # 诊断：把配置里所有 ssl_certificate 相关行打印出来，便于核对
    echo "==> [证书发现] 配置中的 ssl_certificate 指令：" >&2
    while IFS= read -r line; do
        case "$line" in
            *"ssl_certificate"*) echo "    ${line}" >&2 ;;
        esac
    done <"$conf"

    # 逐行配对 ssl_certificate 与紧随其后的 ssl_certificate_key
    while IFS= read -r line; do
        case "$line" in
            \#*) continue ;;
        esac
        case "$line" in
            # ssl_certificate_key 必须先判断：它也包含 "ssl_certificate" 子串
            *"ssl_certificate_key"*)
                value="$(trim "${line#*ssl_certificate_key}")"
                value="$(trim "${value%%;*}")"
                value="$(trim "${value//\"/}")"
                if [ -n "$cert" ] && [ -n "$value" ] && [ "$value" != "none" ]; then
                    printf '%s\t%s\n' "$cert" "$value"
                    cert=""
                fi
                ;;
            *"ssl_certificate"*)
                value="$(trim "${line#*ssl_certificate}")"
                value="$(trim "${value%%;*}")"
                value="$(trim "${value//\"/}")"
                if [ -n "$value" ] && [ "$value" != "none" ]; then
                    cert="$value"
                fi
                ;;
        esac
    done <"$conf"
    rm -f "$conf"

    # (b) Let's Encrypt 常规目录
    local d
    for d in /etc/letsencrypt/live/*/; do
        if [ -f "${d}fullchain.pem" ]; then
            printf '%s\t%s\n' "${d}fullchain.pem" "${d}privkey.pem"
        fi
    done

    # (c) acme.sh
    local f2
    for f2 in /root/.acme.sh/*/*.fullchain.cer; do
        [ -f "$f2" ] || continue
        printf '%s\t%s\n' "$f2" "${f2%.fullchain.cer}.key"
    done
}

# ── 5. 确保 TLS 证书存在 ────────────────────────────────────────────────────
ensure_cert() {
    if [ -e "$CERT_LINK" ] && [ -f "${CERT_LINK}/fullchain.pem" ] && cert_covers "${CERT_LINK}/fullchain.pem"; then
        log "证书已就绪: ${CERT_LINK}"
        return 0
    fi

    # 复用服务器上已有的证书（如 *.ccxcc.cn 泛域名）。
    # 本项目不负责签发证书：服务器上的证书由运维侧维护。
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

    fail "未找到覆盖 ${DOMAIN} 的现有证书。本项目不签发证书，请确认服务器上 nginx 已为该域名配置 ssl_certificate / ssl_certificate_key（覆盖 ${DOMAIN} 的 *.ccxcc.cn 泛域名证书即可）。"
}

ensure_cert

# ── 6. 安装正式站点 (443 TLS) ───────────────────────────────────────────────
log "安装 nginx TLS 站点"

# 清理历史遗留的临时站点文件（可能装在任意一个目录）
for d in $NGINX_SITE_DIRS; do
    rm -f "${d}/loom-relay-acme.conf"
done

# WebSocket 升级映射：供其它可能引用 $connection_upgrade 的配置使用。
# loom-relay.conf 本身已内联 upgrade 头，不依赖此文件。
install_vhost nginx/00-connection-upgrade-map.conf 00-connection-upgrade-map.conf
install_vhost nginx/loom-relay.conf loom-relay.conf

# 提示其它同样声明了该域名的站点配置（仅告警，不改动他人配置；
# nginx 按 include 顺序取第一个匹配）
for d in $NGINX_SITE_DIRS; do
    for f in "${d}"/*; do
        [ -f "$f" ] || continue
        case "$f" in
            "${NGINX_DIR}/loom-relay.conf"|"${NGINX_DIR}/00-connection-upgrade-map.conf") continue ;;
        esac
        if grep -E "server_name" "$f" 2>/dev/null | grep -qF "$DOMAIN"; then
            log "提示: ${f} 也声明了 ${DOMAIN}，请确认其与本中继的优先级"
        fi
    done
done

reload_nginx
dump_nginx_include

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
