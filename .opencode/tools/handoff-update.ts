import { tool } from "@opencode-ai/plugin"
import fs from "node:fs"
import path from "node:path"

const HANDOFF_DIR = ".handoff"
const VALID_TRANSITIONS: Record<string, string[]> = {
  planning: ["executing", "archived"],
  executing: ["completed", "archived"],
  completed: ["archived"],
  archived: [],
}

export default tool({
  description: "更新 handoff 状态。仅 owner 可修改。遵循状态机约束：planning→executing/completed/archived, executing→completed/archived, completed→archived",
  args: {
    id: tool.schema.string().describe("handoff id，如 handoff001"),
    status: tool.schema.enum(["planning", "executing", "completed", "archived"]).describe("目标状态"),
    owner: tool.schema.string().describe("当前 session 标识，必须匹配 handoff 的 owner"),
  },
  async execute(args, ctx) {
    const handoffDir = path.join(ctx.worktree, HANDOFF_DIR)
    if (!fs.existsSync(handoffDir)) return `[handoff] ERROR: .handoff 目录不存在`

    const files = fs.readdirSync(handoffDir).filter(f => f.startsWith(args.id) && f.endsWith(".json"))
    if (files.length === 0) return `[handoff] ERROR: ${args.id} 不存在`

    const filepath = path.join(handoffDir, files[0])
    const handoff = JSON.parse(fs.readFileSync(filepath, "utf-8"))

    if (handoff.owner !== args.owner) {
      return `[handoff] ERROR: ${args.id} 的 owner 是 ${handoff.owner}，当前 session ${args.owner} 无权修改`
    }

    const allowed = VALID_TRANSITIONS[handoff.status]
    if (!allowed.includes(args.status)) {
      return `[handoff] ERROR: 不允许的状态转换: ${handoff.status} → ${args.status}。允许: ${allowed.join(", ")}`
    }

    handoff.status = args.status
    handoff.updated = new Date().toISOString()
    fs.writeFileSync(filepath, JSON.stringify(handoff, null, 2))

    return `[handoff] ${args.id} updated: ${handoff.status} → ${args.status}`
  },
})
