#!/usr/bin/env node
// PreToolUse gate for wippaCLAUDE.
//
// Reads the hook payload as JSON on stdin. Exit 0 allows the tool call; exit 2
// blocks it and shows the message on stderr to the model.
//
// The main session agent is the orchestrator. The hook recognises it by an
// absent agent_type, or by main, primary or wippaAGENT. It may write exactly
// one file, <project>/.wippa/PLAN.md, and run exactly two kinds of command:
// read-only git (diff, status, log, show) and `node scripts/verify.mjs`.
// Subagents may write unless they are reviewers or research roles, and never
// delegate.
//
// This is a policy gate, not a sandbox. Path confinement is lexical: a symlink
// at .wippa/PLAN.md is not detected, and that limitation is published in the
// README. The Bash rule refuses shell separators and substitution rather than
// parsing a shell, so a command that reaches the allowlist still runs with the
// authority of the user.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const IMPLEMENTERS = new Set([
  "core-developer",
  "language-specialist",
  "infrastructure-engineer",
  "data-engineer",
  "developer-experience",
  "domain-specialist",
  "debugger",
  "orchestration-lead",
])

const NO_SHELL = new Set(["research-analyst", "product-strategist"])
const NO_EDIT = new Set(["quality-auditor", "security-reviewer", "research-analyst", "product-strategist"])
const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit"])

function block(message) {
  process.stderr.write(`wippaCLAUDE: ${message}\n`)
  process.exit(2)
}

function readInput() {
  let raw
  try {
    raw = readFileSync(0, "utf8")
  } catch {
    block("could not read the hook payload from stdin; the action is blocked.")
  }
  try {
    return JSON.parse(raw)
  } catch {
    block("the hook payload is not valid JSON; the action is blocked.")
  }
}

/** `project:core-developer` and `core-developer` both name the same agent. */
function normaliseType(value) {
  const text = String(value)
  const tail = text.split(/[:/]/).pop()
  return tail === "" ? text : tail
}

/** Lexical confinement only: resolve() collapses `..`, symlinks stay unseen. */
function targetPath(input) {
  const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (typeof raw !== "string" || raw.trim() === "") return null
  const projectDir = resolve(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
  return resolve(projectDir, raw)
}

const input = readInput()
const tool = typeof input.tool_name === "string" ? input.tool_name : ""
const rawType = input.agent_type
const mainType = rawType === undefined || rawType === null || rawType === "" ? "" : normaliseType(rawType)
const isOrchestrator =
  mainType === "" || mainType === "main" || mainType === "primary" || mainType === "wippaAGENT"

if (isOrchestrator) {
  if (EDIT_TOOLS.has(tool)) {
    const resolved = targetPath(input)
    const ledger = resolve(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), ".wippa", "PLAN.md")
    if (resolved === null) {
      block(
        `${tool} was blocked: no file_path or notebook_path was supplied. ` +
          "Rule: the orchestrator may write only .wippa/PLAN.md.",
      )
    }
    if (resolved !== ledger) {
      block(
        `${tool} to ${resolved} was blocked. ` +
          "Rule: the orchestrator may write only .wippa/PLAN.md. " +
          "Delegate the change to an implementer subagent with the Agent tool.",
      )
    }
    process.exit(0)
  }

  if (tool === "Bash") {
    const command = String(input.tool_input?.command ?? "").trim()
    if (command === "node scripts/verify.mjs") process.exit(0)

    if (/[;&|<>`$]/.test(command) || command.includes("\n") || command.includes("\r")) {
      block(
        "Bash was blocked: the command contains a shell separator, redirection or substitution. " +
          "Rule: the orchestrator may run only read-only git and `node scripts/verify.mjs`, one command at a time.",
      )
    }

    const words = command.split(/\s+/).filter(Boolean)
    const readOnlyGit =
      words[0] === "git" && ["diff", "status", "log", "show"].includes(words[1]) && words.length >= 2
    const writes = words.some((word) =>
      ["--output", "--ext-diff", "--textconv", "--upload-pack", "--open-files-in-pager"].some(
        (flag) => word === flag || word.startsWith(`${flag}=`),
      ),
    )
    if (readOnlyGit && !writes && !command.includes("::")) process.exit(0)

    block(
      `Bash command \`${command}\` was blocked. ` +
        "Rule: the orchestrator may run only `git diff`, `git status`, `git log`, `git show` " +
        "and `node scripts/verify.mjs`. Delegate anything else to a subagent.",
    )
  }

  if (tool === "Agent") process.exit(0)

  process.exit(0)
}

// --- subagent ------------------------------------------------------------

const agentType = normaliseType(rawType)

if (tool === "Agent") {
  block(
    `${agentType} may not use the Agent tool. ` +
      "Rule: subagents do not delegate further. Return your result to the orchestrator and stop.",
  )
}

if (EDIT_TOOLS.has(tool)) {
  if (!IMPLEMENTERS.has(agentType)) {
    block(
      `${agentType} may not use ${tool}. ` +
        "Rule: reviewers and research roles report findings and do not edit files.",
    )
  }
  const resolved = targetPath(input)
  if (resolved !== null) {
    const ledger = resolve(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), ".wippa", "PLAN.md")
    if (resolved === ledger) {
      block(
        `${agentType} may not write .wippa/PLAN.md. ` +
          "Rule: the plan ledger has one writer, the orchestrator.",
      )
    }
  }
  process.exit(0)
}

if (tool === "Bash" && NO_SHELL.has(agentType)) {
  block(
    `${agentType} may not use Bash. ` +
      "Rule: this role has no shell. Report what a command would need to prove, and let the orchestrator run it.",
  )
}

process.exit(0)
