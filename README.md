# wippaCLAUDE

The Claude Code adapter for the wippa agent set. One primary orchestrator, twelve specialist subagents, the playbooks as an on-demand skill, and two hooks that hold the orchestrator to its limits.

The orchestrator plans, delegates through the Agent tool, reviews the diff, and reports. It does not write the implementation, and it does not run the build. A `PreToolUse` hook confines its writes to the plan ledger and its shell to read-only git plus the acceptance gate. A `Stop` hook refuses to let the session finish until the project's acceptance command exits 0.

This repository is the adapter source. It is installed into a project, not used as a runtime of its own. The roles, routing rules, review contract and playbook text come from `wippaCORE` 0.1.x; this repository supplies the Claude Code mapping and the enforcement.

## Requirements

- Claude Code, with project settings and hooks enabled.
- Node 22 or later, for the hooks, the gate and the structural check.
- Bash, for `install.sh` and for the acceptance gate's shell.

## Install

Install into an existing project directory:

```bash
./install.sh --project /path/to/your/project
```

With no `--project`, the current directory is used:

```bash
./install.sh
```

The installer copies `CLAUDE.md`, `.claude/` and `scripts/` into the project. `CLAUDE.md` goes to the project root as the session prompt. If a target already exists it is skipped and reported; pass `--force` to overwrite those files. It creates `.wippa/` when absent and copies the ledger template and the acceptance example. It never overwrites an existing `.wippa/PLAN.md`, and it never creates or changes `.wippa/acceptance`.

If the project already has a `CLAUDE.md`, the installer skips it. Merge the orchestrator section into your existing file by hand; `--force` would replace the whole file.

Preview without writing:

```bash
./install.sh --project /path/to/your/project --dry-run
```

There is no global install. Claude Code reads `.claude/` from the project, so the project is the scope.

## Quick start

1. Set the acceptance command. It is one command, run from the project root, and it decides whether the work is done.

   ```bash
   printf 'npm test\n' > .wippa/acceptance
   ```

2. Start Claude Code in the project.

   ```bash
   claude
   ```

3. Ask for the work. The orchestrator triages it, writes `.wippa/PLAN.md`, dispatches a subagent with a self-contained brief, has the diff reviewed above the Trivial tier, and reports only after the acceptance command exits 0.

The hooks load at session start. If `.wippa/acceptance` is absent, the `Stop` hook prints one warning and allows the session to stop rather than trapping you in a loop.

## What is enforced, what is convention, what is missing

The first table is enforced by the host, given that `.claude/settings.json` is the active settings file and hooks are not disabled. The second is prompt text in `CLAUDE.md` and the subagent files. The third is not in this adapter at all.

### Enforced

| Guarantee | Mechanism |
|---|---|
| The orchestrator cannot edit outside `.wippa/PLAN.md` | `PreToolUse` resolves `file_path` and `notebook_path` for `Edit`, `Write` and `NotebookEdit` and blocks anything but the ledger path |
| The orchestrator cannot run arbitrary shell | `PreToolUse` allows only `git diff`, `git status`, `git log`, `git show` and the exact command `node scripts/verify.mjs`; separators, redirection and substitution are refused, and so are git flags that write, such as `--output` and `--open-files-in-pager` |
| Reviewers and research roles cannot use the edit tools | `quality-auditor`, `security-reviewer`, `research-analyst` and `product-strategist` have no `Edit` or `Write` in their `tools`, and the hook blocks the tools if they are reached another way |
| Research and product roles cannot run a shell | No `Bash` in their `tools`, and the hook blocks it |
| Subagents cannot delegate | `Agent` is absent from every subagent's `tools`, and the hook blocks the tool |
| Subagents cannot write the ledger through the edit tools | The hook blocks a subagent `Edit`, `Write` or `NotebookEdit` that resolves to `.wippa/PLAN.md` |
| Completion is blocked until acceptance exits 0, when `.wippa/acceptance` exists | `Stop` runs `node scripts/verify.mjs`; a non-zero exit returns to the model |
| `rm -rf` and `sudo` are denied | `permissions.deny` in `.claude/settings.json` |

Four limits on the enforcement:

- Path confinement is lexical. The hook resolves `..` and compares the result, but a symlink at `.wippa/PLAN.md` is not detected. Symlink and hardlink protections are an OpenCode feature that was not ported.
- The Bash rule is a policy, not a parser. It refuses separators, redirection and substitution and then checks the first two words. A command that passes still runs with your authority, and the acceptance gate has its own, smaller allowlist.
- The hook recognises the orchestrator by an absent `agent_type`, or by `main`, `primary` or `wippaAGENT`. A host that reports a different value for the main agent is treated as a subagent: its ledger write and its read-only git commands are blocked.
- Reviewers keep `Bash` so they can read a diff. The edit denial covers `Edit`, `Write` and `NotebookEdit`; a shell command that writes a file is not intercepted. Treat a reviewer's shell as read-only by instruction, not by enforcement.

### Convention

- Triage into Trivial, Normal and High-risk, and the chain that follows from it.
- Which subagent owns a task, and the tie-break rules between them.
- The two-iteration review cap.
- The ledger's tier, decisions, work items and open risks.
- Review discipline: a reviewer sees the diff, reports `file:line`, and does not fix its own findings.
- Playbook selection: each subagent reads only the file its `## Playbooks` table names.
- The approval gate before High-risk or structural work.
- Identifying a harness change by reading the diff.

### Not ported

- **The full OpenCode command guard.** `scripts/verify.mjs` is a small allowlist gate with a character policy and a short escape denylist. It is not the layered per-runner guard in `wippaAGENT`, and it is not a sandbox.
- **Automatic harness diff acknowledgement.** The OpenCode adapter lists changed harness files and refuses to run until the orchestrator acknowledges them. Here, the High-risk rule and the reviewer read are conventions.
- **Plan symlink and hardlink protections.** The write is confined to a path, not to an inode.
- **Session-id continuation.** There is no resume tool. Claude Code subagents start fresh, so a revision is a new Agent call with the findings in the brief, not a continued session.

## The agents

Twelve subagents, one per specialist role. `CLAUDE.md` is the orchestrator and is not a subagent file, so the count is 13 prompts but 12 agent definitions.

| Agent | Access | Remit |
|---|---|---|
| `core-developer` | read, write, shell | Application code end to end: API contract, auth, services, frontend, GraphQL, mobile, desktop, real-time |
| `language-specialist` | read, write, shell | Language and framework implementation and idiom across the ecosystem |
| `infrastructure-engineer` | read, write, shell | Cloud, Terraform, Kubernetes, networking, CI/CD, observability, Windows and PowerShell |
| `quality-auditor` | read, shell | General review: correctness, architecture, tests, accessibility, interface, performance. No edit |
| `security-reviewer` | read, shell | Security audit, pentesting, Active Directory, compliance and privacy, supply chain. No edit |
| `debugger` | read, write, shell | Reproduction, root cause, log correlation, test automation, flake, resilience |
| `data-engineer` | read, write, shell | Pipelines, databases, query tuning, analytics, ML, NLP, LLM systems, reinforcement learning |
| `developer-experience` | read, write, shell | Builds, dev servers, CLIs, dependencies, refactoring, docs, git workflow, tooling |
| `domain-specialist` | read, write, shell | Regulated and platform-shaped verticals: finance, payments, health, embedded, IoT, M365, SEO |
| `product-strategist` | read, no shell | Strategy, roadmap, backlog, experiments, content, legal framing, delivery planning |
| `orchestration-lead` | read, write, shell | Cross-specialty routing, agent installs, failure recovery, GitHub issues, PRs, CI, releases |
| `research-analyst` | read, no shell | Evidence gathering, market and competitor research, experiments, user research, repo recon |

Every subagent has `Skill`, so it can load `specialist-playbooks` (or `domain-playbooks`) and read the one reference file the brief names. No subagent has `Agent`.

## Differences from `wippaAGENT`

`wippaAGENT` is the OpenCode reference adapter for the same core. This adapter is not a port of its plugin; it uses what Claude Code provides.

| | `wippaAGENT` | `wippaCLAUDE` |
|---|---|---|
| Primary prompt | `wippaAGENT.md`, installed as an agent | `CLAUDE.md` at the project root, the session prompt |
| Dispatch | `subagent` tool with a role id | Agent tool with a subagent name |
| Diff reading | `wippa_diff` returns structured per-file patches | The reviewer runs `git diff` with its own shell |
| Acceptance | `wippa_verify`, with a layered command guard | `scripts/verify.mjs`, a smaller allowlist gate, run by the `Stop` hook |
| Ledger | `wippa_plan_update` writes `.opencode/PLAN.md` and refuses links | `Write` to `.wippa/PLAN.md`, confined by the `PreToolUse` hook |
| Revision | `wippa_subagent_continue` resumes the child session | A new Agent call with the findings; the subagent starts fresh |
| Harness check | Automatic file match, acknowledgement required | Manual: a High-risk convention |
| Analysis roles | `edit`, no shell | Read-only: `product-strategist` and `research-analyst` have no `Edit` or `Write` and report in the message |
| MCP servers | Ships `github`, `context7` and `playwright` configuration | Ships none; use the MCP servers configured in your Claude Code |
| Prompt budget and eval scenarios | Present in CI | Not present |

What to expect in practice: the same roles, tiers, briefs and return contract, with less machinery around them. A revision costs a fresh subagent context, so put the failing diff and the findings in the new brief. The acceptance gate accepts a narrower command surface, so a project whose check needs an unusual runner should wrap it in a `package.json` script or a Makefile target rather than extending the gate.

## Layout

```
README.md
CLAUDE.md                       primary orchestrator prompt
LICENSE
CHANGELOG.md
package.json
install.sh
.claude/
  settings.json                 permissions and the two hooks
  agents/                       twelve subagent definitions
  skills/                       six playbook skills
scripts/
  check.mjs                     structural check, no dependencies
  verify.mjs                    acceptance gate
  hooks/pre-tool-use.mjs        write, shell and delegation limits
  hooks/stop-verify.mjs         blocks completion until acceptance exits 0
.wippa/
  acceptance.example            the command template
  PLAN.md                       the ledger template
.github/workflows/ci.yml
```

## Checking a checkout

```bash
node scripts/check.mjs
bash -n install.sh
```

`check.mjs` asserts the twelve agent files and their tool lists, the two hooks in `settings.json`, the six skill folders, the scripts, and the top-level documents. It is a structural check: it proves the files agree with each other, not that a Claude Code session behaves as described.

## Related repositories

- [`wippaAGENT`](https://github.com/wippa-studios/wippaAGENT) is the OpenCode reference adapter for the same core.
- [`wippaCORE`](https://github.com/wippa-studios/wippaCORE) is the framework-neutral core at 0.1.1 that this adapter implements.

## Licence

MIT. See [`LICENSE`](LICENSE).
