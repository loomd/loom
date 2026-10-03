# Licensing

## 当前协议

**Functional Source License, Version 1.1, ALv2 Future License（FSL-1.1-ALv2）**

自 **2026-10-04** 起发布的版本适用 FSL-1.1-ALv2，协议全文见 [LICENSE](LICENSE)。

SPDX 标识为 `LicenseRef-FSL-1.1-ALv2`（FSL 未进入 SPDX 官方列表，故采用 LicenseRef 形式）。各 crate 通过 `license.workspace = true` 从 workspace 继承。

### FSL 授予什么

- 允许使用、复制、修改、创建衍生作品、公开展示、再分发
- **不要求**你公开自己的修改源码，闭源衍生作品是被允许的
- 允许内部使用、非商业教育与研究、以及为已获许可用户提供专业服务（咨询、部署、实施）
- 附带专利授权（含专利报复条款）与商标限制

### FSL 禁止什么

禁止将 Loom 用于构建**与本项目竞争**的商业产品或服务（协议中的 "Competing Use"），包括但不限于：

1. 做出替代 Loom 的商业产品
2. 做出替代你方其他已发布产品的商业产品
3. 提供与 Loom 相同或实质相似功能的商业产品或服务

典型命中场景：把 Loom 托管成云服务并收取订阅费；以新品牌发布功能与 Loom 基本一致的替代品。

判断边界是"是否构成竞品"，而非"是否用于商业目的"。Loom 协议授权说明详见 [TRADEMARKS.md](TRADEMARKS.md)。

## 两年转换机制

FSL-1.1-ALv2 第 10 条预先不可撤销地授予 Apache-2.0 许可，该许可在**每个版本发布满两年后**自动生效。

- 转换按**版本**计算，从该版本发布日算起，而非仓库创建日
- 不可撤销：即使项目停止维护或仓库下线，该版本的 Apache-2.0 授权依然有效
- 转换目标只能是 Apache-2.0 或 MIT（FSL 1.1 不允许指定其他转换协议）

获取当前可自由使用的 Apache-2.0 版本：

```bash
git clone https://github.com/loomd/loom.git
cd loom
git checkout $(git rev-list -n 1 --before="2 years ago" main)
```

该提交上的 LICENSE 已是 Apache-2.0，可用于任何用途（含商业）。

## 版本协议历史

版权授权一经授予即不可撤销，因此**已发布的旧版本永久适用其发布时的协议**，不受后续变更影响。任何已经获得旧版本代码的使用者，其权利不因本次切换而改变。

| 版本区间 | 发布日期 | 适用协议 |
|---|---|---|
| v0.1.1 – v0.5.21 | 至 2026-08-06 | MIT |
| v0.6.1 – v0.7.11 | 2026-08-15 – 2026-09-27 | AGPL-3.0 |
| 2026-10-04 之后的版本 | 起 | **FSL-1.1-ALv2** |
| 对应版本发布满两年后 | 逐版本 | Apache-2.0 |

各协议对应的 git 变更：

- `f721577`（2026-06-20）引入 MIT LICENSE
- `c0f9b61`（2026-08-14）MIT → AGPL-3.0
- 2026-10-04 AGPL-3.0 → FSL-1.1-ALv2

## 商业授权

若你的使用方式构成上述 "Competing Use"，或需要商标授权，请通过
[GitHub Discussions](https://github.com/loomd/loom/discussions) 联系。

商业授权可提供的范围包括：竞品使用的许可、商标使用许可、技术支持与 SLA、赔偿条款。
