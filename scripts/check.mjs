#!/usr/bin/env node
// Structural check for the wippaCLAUDE repository. Zero dependencies.
//
// It proves that the files exist, the agent frontmatter is well formed, the
// tool lists carry the intended denials, the hooks are wired and the six skills
// are installed. It proves nothing about a running Claude Code session.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const errors = []

function assert(condition, message) {
  if (!condition) errors.push(message)
}

function read(path) {
  return readFileSync(join(ROOT, path), "utf8")
}

function isFile(path) {
  return existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile()
}

function isDirectory(path) {
  return existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isDirectory()
}

/** Minimal single-line `key: value` frontmatter parser, enough for agent files. */
function scalar(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

function frontmatter(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  if (lines[0] !== "---") return null
  const end = lines.indexOf("---", 1)
  if (end === -1) return null
  const data = {}
  const raw = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line)
    if (match !== null) {
      data[match[1]] = scalar(match[2].trim())
      raw[match[1]] = match[2].trim()
    }
  }
  return { data, raw, body: lines.slice(end + 1).join("\n") }
}

function listTools(value) {
  return String(value)
    .split(",")
    .map((tool) => tool.trim())
    .filter((tool) => tool !== "")
}

// --- agents --------------------------------------------------------------

const IMPLEMENTERS = [
  "core-developer",
  "language-specialist",
  "infrastructure-engineer",
  "data-engineer",
  "developer-experience",
  "domain-specialist",
  "debugger",
  "orchestration-lead",
]
const REVIEWERS = ["quality-auditor", "security-reviewer"]
const RESEARCH = ["research-analyst", "product-strategist"]
const ALL = [...IMPLEMENTERS, ...REVIEWERS, ...RESEARCH]

const agentDirectory = ".claude/agents"
const agentFiles = isDirectory(agentDirectory)
  ? readdirSync(join(ROOT, agentDirectory), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort()
  : []

assert(isDirectory(agentDirectory), `${agentDirectory}: missing`)
assert(agentFiles.length === 12, `${agentDirectory}: expected 12 agent files, found ${agentFiles.length}`)

for (const id of ALL) {
  const path = `${agentDirectory}/${id}.md`
  assert(isFile(path), `${path}: missing`)
  if (!isFile(path)) continue

  const text = read(path)
  const parsed = frontmatter(text)
  if (parsed === null) {
    assert(false, `${path}: missing or malformed frontmatter`)
    continue
  }

  const { data, body } = parsed
  const tools = listTools(data.tools ?? "")

  assert(data.name === id, `${path}: name must be ${id}`)
  assert(typeof data.description === "string" && data.description.length > 0, `${path}: description is empty`)
  assert(
    typeof parsed.raw.description === "string" && /^["']/.test(parsed.raw.description),
    `${path}: description must be quoted so a YAML parser keeps its colons`,
  )
  assert(tools.length > 0, `${path}: tools is empty`)
  assert(data.model === "inherit", `${path}: model must be inherit`)
  assert(!tools.includes("Agent"), `${path}: tools must not include Agent`)

  const expectTurnLimit = IMPLEMENTERS.includes(id) ? "60" : "40"
  assert(data.maxTurns === expectTurnLimit, `${path}: maxTurns must be ${expectTurnLimit}`)

  if (IMPLEMENTERS.includes(id)) {
    assert(tools.includes("Edit"), `${path}: an implementer must have Edit`)
    assert(tools.includes("Write"), `${path}: an implementer must have Write`)
    assert(tools.includes("Bash"), `${path}: an implementer must have Bash`)
  }

  if (REVIEWERS.includes(id)) {
    assert(!tools.includes("Edit"), `${path}: a reviewer must not have Edit`)
    assert(!tools.includes("Write"), `${path}: a reviewer must not have Write`)
    assert(tools.includes("Bash"), `${path}: a reviewer must have Bash to read the diff`)
  }

  if (RESEARCH.includes(id)) {
    assert(!tools.includes("Edit"), `${path}: a research role must not have Edit`)
    assert(!tools.includes("Write"), `${path}: a research role must not have Write`)
    assert(!tools.includes("Bash"), `${path}: a research role must not have Bash`)
  }

  assert(tools.includes("Skill"), `${path}: tools must include Skill`)
  assert(!/^##\s+Attribution$/m.test(body), `${path}: attribution block must not be copied into the agent body`)
}

// --- settings ------------------------------------------------------------

const settingsPath = ".claude/settings.json"
assert(isFile(settingsPath), `${settingsPath}: missing`)
let settings = null
if (isFile(settingsPath)) {
  try {
    settings = JSON.parse(read(settingsPath))
  } catch (error) {
    assert(false, `${settingsPath}: not valid JSON (${error.message})`)
  }
}

if (settings !== null) {
  const pre = settings.hooks?.PreToolUse
  assert(Array.isArray(pre) && pre.length > 0, `${settingsPath}: hooks.PreToolUse is missing`)
  if (Array.isArray(pre)) {
    const entry = pre.find((candidate) => typeof candidate.matcher === "string")
    assert(entry !== undefined, `${settingsPath}: PreToolUse has no matcher entry`)
    if (entry !== undefined) {
      for (const tool of ["Edit", "Write", "NotebookEdit", "Bash", "Agent"]) {
        assert(entry.matcher.split("|").includes(tool), `${settingsPath}: PreToolUse matcher must include ${tool}`)
      }
      const command = entry.hooks?.[0]?.command
      assert(
        command === "node scripts/hooks/pre-tool-use.mjs",
        `${settingsPath}: PreToolUse command must be node scripts/hooks/pre-tool-use.mjs`,
      )
    }
  }

  const stop = settings.hooks?.Stop
  assert(Array.isArray(stop) && stop.length > 0, `${settingsPath}: hooks.Stop is missing`)
  if (Array.isArray(stop)) {
    const command = stop[0]?.hooks?.[0]?.command
    assert(
      command === "node scripts/hooks/stop-verify.mjs",
      `${settingsPath}: Stop command must be node scripts/hooks/stop-verify.mjs`,
    )
  }

  const deny = settings.permissions?.deny
  assert(Array.isArray(deny), `${settingsPath}: permissions.deny is missing`)
  if (Array.isArray(deny)) {
    assert(deny.includes("Bash(rm -rf *)"), `${settingsPath}: permissions.deny must include Bash(rm -rf *)`)
    assert(deny.includes("Bash(sudo *)"), `${settingsPath}: permissions.deny must include Bash(sudo *)`)
  }

  const allow = settings.permissions?.allow
  assert(
    allow === undefined || (Array.isArray(allow) && allow.length === 0),
    `${settingsPath}: a global permissions.allow list must not be shipped; the hook is the gate`,
  )
}

// --- skills --------------------------------------------------------------

const SKILLS = [
  "specialist-playbooks",
  "domain-playbooks",
  "powershell-automation-playbooks",
  "reinforcement-learning-playbooks",
  "compliance-privacy-playbooks",
  "content-legal-media-playbooks",
]

for (const skill of SKILLS) {
  const directory = `.claude/skills/${skill}`
  const skillFile = `${directory}/SKILL.md`
  assert(isDirectory(directory), `${directory}: missing`)
  assert(isFile(skillFile), `${skillFile}: missing`)
  if (!isFile(skillFile)) continue
  assert(statSync(join(ROOT, skillFile)).size > 0, `${skillFile}: empty`)
  const parsed = frontmatter(read(skillFile))
  assert(parsed !== null, `${skillFile}: missing or malformed frontmatter`)
  if (parsed !== null) {
    assert(parsed.data.name === skill, `${skillFile}: frontmatter name must be ${skill}`)
    assert((parsed.data.description ?? "").length > 0, `${skillFile}: description is empty`)
    assert(
      typeof parsed.raw.description === "string" && /^["']/.test(parsed.raw.description),
      `${skillFile}: description must be quoted so a YAML parser keeps its colons`,
    )
  }
}

// --- scripts and documents ----------------------------------------------

for (const file of [
  "scripts/verify.mjs",
  "scripts/hooks/pre-tool-use.mjs",
  "scripts/hooks/stop-verify.mjs",
  "scripts/check.mjs",
  "install.sh",
  ".github/workflows/ci.yml",
]) {
  assert(isFile(file), `${file}: missing`)
  if (isFile(file)) assert(statSync(join(ROOT, file)).size > 0, `${file}: empty`)
}

for (const file of [
  "CLAUDE.md",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "package.json",
  ".wippa/acceptance.example",
  ".wippa/PLAN.md",
]) {
  assert(isFile(file), `${file}: missing`)
  if (isFile(file)) assert(statSync(join(ROOT, file)).size > 0, `${file}: empty`)
}

assert(isFile("package.json"), "package.json: missing")
if (isFile("package.json")) {
  try {
    const pkg = JSON.parse(read("package.json"))
    assert(pkg.scripts?.check === "node scripts/check.mjs", "package.json: scripts.check must run node scripts/check.mjs")
  } catch (error) {
    assert(false, `package.json: not valid JSON (${error.message})`)
  }
}

if (isFile("CLAUDE.md")) {
  const text = read("CLAUDE.md")
  assert(text.includes(".wippa/PLAN.md"), "CLAUDE.md: must name the plan ledger path .wippa/PLAN.md")
  assert(text.includes(".wippa/acceptance"), "CLAUDE.md: must name the acceptance file .wippa/acceptance")
  assert(text.includes("You report only to me"), "CLAUDE.md: must carry the closing line for delegation briefs")
}

if (isFile("install.sh")) {
  const text = read("install.sh")
  assert(
    text.includes('copy_file "$source_dir/CLAUDE.md" "$project/CLAUDE.md"'),
    "install.sh: must copy CLAUDE.md to the project root through copy_file",
  )
}

if (isFile(".github/workflows/ci.yml")) {
  const text = read(".github/workflows/ci.yml")
  assert(text.includes("node scripts/check.mjs"), "ci.yml: must run node scripts/check.mjs")
  assert(text.includes("bash -n install.sh"), "ci.yml: must run bash -n install.sh")
}

function markdownFilesUnder(directory, prefix = "") {
  const files = []
  if (!isDirectory(directory)) return files
  const base = prefix === "" ? directory : `${directory}/${prefix}`
  for (const entry of readdirSync(join(ROOT, base), { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) files.push(...markdownFilesUnder(directory, relative))
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(`${directory}/${relative}`)
  }
  return files
}

const proseFiles = [
  ...readdirSync(join(ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name),
  ...markdownFilesUnder(".claude"),
]

for (const file of proseFiles) {
  const text = read(file)
  assert(!/^##\s+Attribution$/m.test(text), `${file}: attribution block must not be present`)
  assert(!text.includes("Co-Authored-By: wippaAGENT"), `${file}: commit trailer must not appear in the file`)
}

// --- result --------------------------------------------------------------

if (errors.length > 0) {
  console.error(`check: ${errors.length} failure(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `check: ok - ${agentFiles.length} agents, ${SKILLS.length} skills, ` +
    `2 hooks, ${IMPLEMENTERS.length} implementers`,
)
