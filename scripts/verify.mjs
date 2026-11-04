#!/usr/bin/env node
// Acceptance gate for wippaCLAUDE.
//
// Reads one command from .wippa/acceptance, or from `-- <command>` when a
// command is passed on the command line, validates it, runs it from the project
// root and exits with its real exit code.
//
// This is a convenience gate, not the OpenCode command guard and not a sandbox.
// It refuses shell metacharacters, requires every `&&` segment to begin with an
// allowlisted command word, and denies a short list of interpreter escape
// flags. It does not inspect what an allowed command runs: the project's test
// files, package scripts, makefiles and shell scripts still decide that. An
// allowed command runs with the authority of the user.
//
// Exit codes: the command's own, 124 on timeout, 2 on a guard refusal.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const ROOT = process.cwd()
const TIMEOUT_MS = 300000

const ALLOWED = new Set([
  "npm",
  "pytest",
  "go",
  "cargo",
  "make",
  "node",
  "python3",
  "python",
  "git",
  "bash",
  "shellcheck",
  "true",
  "false",
  "./install.sh",
])

function refuse(reason) {
  process.stderr.write(`verify: refused: ${reason}\n`)
  process.exit(2)
}

function readCommand() {
  const args = process.argv.slice(2)
  const separator = args.indexOf("--")
  if (separator !== -1) {
    const command = args.slice(separator + 1).join(" ").trim()
    if (command === "") refuse("no command after --")
    return command
  }

  const file = join(ROOT, ".wippa", "acceptance")
  if (!existsSync(file)) {
    refuse("no command: pass `-- <command>` or create .wippa/acceptance")
  }

  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim()
      return trimmed !== "" && !trimmed.startsWith("#")
    })

  if (lines.length === 0) refuse(".wippa/acceptance contains no command")
  if (lines.length > 1) {
    refuse(".wippa/acceptance contains more than one command; use one command or an && chain")
  }

  const command = lines[0].trim()
  if (command === "") refuse(".wippa/acceptance contains no command")
  return command
}

/**
 * Split on unquoted `&&`. Returns null for an unquoted lone `&` or for an
 * unterminated quote, both of which are refused rather than guessed at.
 */
function splitSegments(command) {
  const segments = []
  let current = ""
  let quote = null

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]

    if (quote !== null) {
      current += char
      if (char === quote) quote = null
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }

    if (char === "&") {
      if (command[index + 1] === "&") {
        segments.push(current)
        current = ""
        index += 1
        continue
      }
      return null
    }

    current += char
  }

  if (quote !== null) return null
  segments.push(current)
  return segments
}

function checkEscapeFlags(word, args) {
  const deny = (pattern, label) => {
    if (args.some((arg) => pattern.test(arg))) {
      refuse(`\`${word} ${label}\` is not allowed in an acceptance command`)
    }
  }

  if (word === "node") deny(/^-[A-Za-z]*[ep]/, "-e/-p")
  if (word === "node") deny(/^--(eval|print)(=.*)?$/, "--eval/--print")
  if (word === "python" || word === "python3") deny(/^-[A-Za-z]*c/, "-c")
  if (word === "pytest") deny(/^--(pdb|trace)(=.*)?$/, "--pdb/--trace")
  if (word === "go") deny(/^-(toolexec|vettool)(=.*)?$/, "-toolexec/-vettool")
  if (word === "cargo") deny(/^--config(=.*)?$/, "--config")
  if (word === "make") deny(/^-[fCE]/, "-f/-C/-E")
  if (word === "bash") deny(/^-[A-Za-z]*c/, "-c")
  if (word === "git") deny(/^-[cC]/, "-c/-C")
  if (word === "git") deny(/^--config-env(=.*)?$/, "--config-env")
}

const command = readCommand()

for (const char of ["\n", "\r", "\0", ";", "|", "$", "`", ">", "<"]) {
  if (command.includes(char)) {
    const label = char === "\0" ? "a null byte" : JSON.stringify(char)
    refuse(`the command contains ${label}`)
  }
}

const segments = splitSegments(command)
if (segments === null) refuse("the command contains an unquoted & or an unterminated quote")

for (const raw of segments) {
  const segment = raw.trim()
  if (segment === "") refuse("the command contains an empty segment")

  const words = segment.split(/\s+/)
  const word = words[0]
  if (!ALLOWED.has(word)) {
    refuse(`\`${word}\` is not an allowed command word`)
  }
  checkEscapeFlags(word, words.slice(1))
}

const result = spawnSync("bash", ["-lc", command], {
  cwd: ROOT,
  timeout: TIMEOUT_MS,
  encoding: "utf8",
  env: process.env,
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.error?.code === "ETIMEDOUT") {
  process.stderr.write(`verify: timed out after ${TIMEOUT_MS} ms\n`)
  process.exit(124)
}

if (result.error) {
  process.stderr.write(`verify: could not run the command: ${result.error.message}\n`)
  process.exit(2)
}

if (result.signal) {
  process.stderr.write(`verify: the command was terminated by ${result.signal}\n`)
  process.exit(2)
}

process.exit(result.status ?? 2)
