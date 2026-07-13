import { tool } from "@opencode-ai/plugin"
import fs from "node:fs"
import path from "node:path"

const HANDOFF_DIR = ".handoff"

export default tool({
  description: "检查文件是否与现有 planning/executing 状态的 handoff 冲突。新 session 启动后必须先 check 再 create。",
  args: {
    files: tool.schema.array(tool.schema.string()).describe("要检查的文件列表"),
  },
  async execute(args, ctx) {
    const handoffDir = path.join(ctx.worktree, HANDOFF_DIR)
    if (!fs.existsSync(handoffDir)) return JSON.stringify({ ok: true, conflicts: [] })

    const activeFiles = fs.readdirSync(handoffDir).filter(f => f.endsWith(".json"))
    const conflicts: any[] = []

    for (const file of activeFiles) {
      const handoff = JSON.parse(fs.readFileSync(path.join(handoffDir, file), "utf-8"))
      if (handoff.status !== "planning" && handoff.status !== "executing") continue

      const overlap = args.files.filter(f => handoff.files.includes(f))
      if (overlap.length > 0) {
        conflicts.push({ id: handoff.id, title: handoff.title, owner: handoff.owner, status: handoff.status, overlap })
      }
    }

    if (conflicts.length === 0) {
      return JSON.stringify({ ok: true, conflicts: [], message: "无冲突" })
    }

    return JSON.stringify({
      ok: false,
      conflicts,
      message: `检测到 ${conflicts.length} 个冲突 handoff: ${conflicts.map(c => `${c.id}(${c.title})`).join(", ")}`,
    })
  },
})
