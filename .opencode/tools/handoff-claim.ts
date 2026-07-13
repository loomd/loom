import { tool } from "@opencode-ai/plugin"
import fs from "node:fs"
import path from "node:path"

const HANDOFF_DIR = ".handoff"

export default tool({
  description: "强制接管一个 handoff。用于旧 session 上下文燃尽时，新 session 接替继续工作。只能接管 planning 或 executing 状态的 handoff。",
  args: {
    id: tool.schema.string().describe("要接管的 handoff id，如 handoff001"),
    newOwner: tool.schema.string().describe("新 session 标识"),
  },
  async execute(args, ctx) {
    const handoffDir = path.join(ctx.worktree, HANDOFF_DIR)
    if (!fs.existsSync(handoffDir)) return `[handoff] ERROR: .handoff 目录不存在`

    const files = fs.readdirSync(handoffDir).filter(f => f.startsWith(args.id) && f.endsWith(".json"))
    if (files.length === 0) return `[handoff] ERROR: ${args.id} 不存在`

    const filepath = path.join(handoffDir, files[0])
    const handoff = JSON.parse(fs.readFileSync(filepath, "utf-8"))

    if (handoff.status !== "planning" && handoff.status !== "executing") {
      return `[handoff] ERROR: 只能接管 planning 或 executing 状态的 handoff，当前状态: ${handoff.status}`
    }

    const prevOwner = handoff.owner
    handoff.owner = args.newOwner
    handoff.updated = new Date().toISOString()
    handoff.claimHistory = handoff.claimHistory || []
    handoff.claimHistory.push({
      from: prevOwner,
      to: args.newOwner,
      at: handoff.updated,
    })
    fs.writeFileSync(filepath, JSON.stringify(handoff, null, 2))

    return `[handoff] ${args.id} claimed | ${prevOwner} → ${args.newOwner} | status: ${handoff.status}`
  },
})
