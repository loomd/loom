import { tool } from "@opencode-ai/plugin"
import fs from "node:fs"
import path from "node:path"

const HANDOFF_DIR = ".handoff"

function readAllHandoffs(dir: string): Record<string, any>[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8")
      return { ...JSON.parse(raw), _file: f }
    })
}

function nextId(dir: string): string {
  const existing = readAllHandoffs(dir)
  const nums = existing
    .map(h => parseInt(h.id.replace("handoff", ""), 10))
    .filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return `handoff${String(max + 1).padStart(3, "0")}`
}

export default tool({
  description: "创建新的 handoff。必须先 check 确认无冲突。仅复杂修改使用。",
  args: {
    title: tool.schema.string().describe("handoff 标题，简短描述任务"),
    abstract: tool.schema.string().describe("高度抽象描述涉及范围"),
    files: tool.schema.array(tool.schema.string()).describe("涉及的文件列表"),
    owner: tool.schema.string().describe("持有者 session 标识"),
    conflictsWith: tool.schema.array(tool.schema.string()).optional().default([]).describe("已知冲突的 handoff id"),
    dependsOn: tool.schema.array(tool.schema.string()).optional().default([]).describe("依赖的 handoff id"),
  },
  async execute(args, ctx) {
    const handoffDir = path.join(ctx.worktree, HANDOFF_DIR)
    if (!fs.existsSync(handoffDir)) fs.mkdirSync(handoffDir, { recursive: true })

    const id = nextId(handoffDir)
    const now = new Date().toISOString()
    const handoff = {
      id,
      title: args.title,
      abstract: args.abstract,
      status: "planning",
      owner: args.owner,
      files: args.files,
      conflictsWith: args.conflictsWith,
      dependsOn: args.dependsOn,
      created: now,
      updated: now,
    }

    const filename = `${id}-${args.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "").slice(0, 40)}.json`
    fs.writeFileSync(path.join(handoffDir, filename), JSON.stringify(handoff, null, 2))

    return `[handoff] ${id} created | status: planning | owner: ${args.owner} | files: ${args.files.join(", ")}`
  },
})
