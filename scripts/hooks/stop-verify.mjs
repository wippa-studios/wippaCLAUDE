#!/usr/bin/env node
// Stop gate for wippaCLAUDE.
//
// Runs when the orchestrator tries to end its turn. If the project has declared
// an acceptance command in .wippa/acceptance, the command is run through
// scripts/verify.mjs. Exit 0 lets the session stop; exit 2 blocks the stop and
// shows the acceptance output to the model on stderr.
//
// A project with no .wippa/acceptance is not gated: the hook prints one warning
// and allows the stop, so a fresh install cannot trap the user in a loop. The
// hook does not cap how many times it blocks. The two-iteration review cap in
// CLAUDE.md is the cap on the revision loop, not on this gate.

import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
const acceptance = join(root, ".wippa", "acceptance")
const verifier = join(root, "scripts", "verify.mjs")

if (!existsSync(acceptance)) {
  process.stderr.write(
    "wippaCLAUDE: no .wippa/acceptance file; the acceptance gate is not configured for this project. Allowing the stop.\n",
  )
  process.exit(0)
}

if (!existsSync(verifier)) {
  process.stderr.write(
    "wippaCLAUDE: .wippa/acceptance exists but scripts/verify.mjs is missing; the acceptance gate cannot run. Allowing the stop.\n",
  )
  process.exit(0)
}

const result = spawnSync("node", ["scripts/verify.mjs"], {
  cwd: root,
  encoding: "utf8",
  timeout: 320000,
  env: process.env,
})

if (result.status === 0) process.exit(0)

const parts = ["wippaCLAUDE: the acceptance command did not exit 0. The stop is blocked."]
if (result.error?.code === "ETIMEDOUT") parts.push("verify: timed out")
if (result.signal) parts.push(`verify: terminated by ${result.signal}`)
if (result.stdout) parts.push(result.stdout.trimEnd())
if (result.stderr) parts.push(result.stderr.trimEnd())
if (!result.stdout && !result.stderr && result.error) parts.push(String(result.error))

process.stderr.write(`${parts.join("\n")}\n`)
process.exit(2)
