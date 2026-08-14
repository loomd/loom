# Session: 2026-08-14 修复 cargo tauri dev 白屏/Vite HMR 问题

## 问题
`cargo tauri dev` 编译成功后，webview 白屏，报错：
```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"
```

## 表现
- Vite dev server 正常启动在 `http://localhost:1420/`
- 但 webview 加载的是 `http://tauri.localhost/`（Tauri 自定义协议）而非 `http://localhost:1420/`
- `devUrl` 配置被完全忽略

## 根因
`crates/gui/src-tauri/Cargo.toml` 中 tauri 依赖启用了 `custom-protocol` 特性：
```toml
tauri = { version = "2.0.0", features = ["tray-icon", "image-png", "custom-protocol"] }
```
该特性在 `70eacbd` 提交中被添加。启用后，Tauri 会启动自定义协议服务（`http://tauri.localhost/`）来提供前端资源，导致 `devUrl` 配置被忽略，webview 始终从 `tauri.localhost` 加载而非 Vite dev server。

## 修复
移除 `custom-protocol` 特性：
```toml
tauri = { version = "2.0.0", features = ["tray-icon", "image-png"] }
```

## 其他发现
- Tauri CLI 2.11.3 配合 Tauri crate 2.0.0 时，`devUrl` 被 `custom-protocol` 覆盖，升级 crate 到 2.11 不能解决此问题
- 编译时 `frontendDist` 路径必须存在（`crates/gui/dist/`），否则 `generate_context!()` 宏报错
- `package.json` 的 `dev` 脚本已修改为 `node -e "require('fs').mkdirSync('../dist',{recursive:true})" && vite` 以确保 `dist` 目录存在