# Changelog

All notable changes to wippaCLAUDE are recorded here. The format follows Keep a Changelog, and the project uses semantic versioning.

## [0.1.0] - 2026-11-04

### Added

- `CLAUDE.md`, the primary orchestrator prompt: triage, delegation, review, acceptance, the plan ledger, the return contract, failure handling and the limits of the adapter.
- Twelve subagent definitions under `.claude/agents/`, generated from the `wippaCORE` role files, with per-role tool allowlists and no delegation.
- The six playbook folders installed as Claude Code skills under `.claude/skills/`.
- `scripts/hooks/pre-tool-use.mjs`, which confines the orchestrator's writes to `.wippa/PLAN.md`, restricts its shell to read-only git and the acceptance gate, and blocks subagent delegation.
- `scripts/hooks/stop-verify.mjs`, which blocks completion until the project's acceptance command exits 0.
- `scripts/verify.mjs`, a small acceptance gate with a command allowlist, a character policy and interpreter-escape denials.
- `scripts/check.mjs`, a zero-dependency structural check, plus the `check` and `test` scripts in `package.json`.
- `install.sh`, a project-local installer with `--dry-run`, `--force`, and no overwrite of `.wippa/PLAN.md` or `.wippa/acceptance`.
- GitHub Actions workflow that runs the structural check and `bash -n install.sh`.

### Notes

- The full OpenCode command guard, automatic harness diff acknowledgement, plan symlink and hardlink protections, and session-id continuation are not ported. See `CLAUDE.md` and the README trust table.
