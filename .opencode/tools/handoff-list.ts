import { tool } from "@opencode-ai/plugin"
import fs from "node:fs"
import path from "node:path"

const HANDOFF_DIR = ".handoff"

export default tool({
  description: "列出所有 handoff 及其状态、owner、涉及文件。",
  args: {},
  async execute(args, ctx) {
    const handoffDir = path.join(ctx.worktree, HANDOFF_DIR)
    if (!fs.existsSync(handoffDir)) return "无 handoff"

    const files = fs.readdirSync(handoffDir).filter(f => f.endsWith(".json"))
    if (files.length === 0) return "无 handoff"

    const handoffs = files.map(f => {
      const h = JSON.parse(fs.readFileSync(path.join(handoffDir, f), "utf-8"))
      return `${h.id} | ${h.status.padEnd(10)} | ${h.owner.padEnd(10)} | ${h.title}`
    })

    return `handoff 列表:\n${handoffs.join("\n")}`
  },
})
