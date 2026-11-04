#!/usr/bin/env bash
# Install the wippaCLAUDE adapter into one project directory.
#
# Copies CLAUDE.md, .claude/ and scripts/ into the project, creates .wippa/ when
# it is absent, and never overwrites an existing .wippa/PLAN.md or
# .wippa/acceptance.
# It does not install globally: Claude Code reads the project's .claude/
# directory, so a project-local install is the only scope this adapter has.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [--project DIR] [--dry-run] [--force]

  --project DIR   Install into DIR. Defaults to the current directory.
  --dry-run       Print every planned action and write nothing.
  --force         Overwrite an existing CLAUDE.md and existing files under
                  .claude/ and scripts/.
  -h, --help      Print this help.

Files are copied from the checkout that contains this script. Existing files are
skipped unless --force is given. CLAUDE.md is copied to the project root; if the
project already has one, it is skipped and you must merge the orchestrator
section into it by hand. .wippa/PLAN.md is never overwritten, and
.wippa/acceptance is never created or changed.
EOF
}

project="."
dry_run=0
force=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        printf 'install: --project needs a directory\n' >&2
        exit 2
      fi
      project="$2"
      shift 2
      ;;
    --project=*)
      project="${1#*=}"
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --force)
      force=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'install: unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$project" ] || [ ! -d "$project" ]; then
  printf 'install: project directory does not exist: %s\n' "$project" >&2
  exit 1
fi

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project="$(cd "$project" && pwd)"

if [ ! -f "$source_dir/CLAUDE.md" ] || [ ! -d "$source_dir/.claude" ] || [ ! -d "$source_dir/scripts" ]; then
  printf 'install: the checkout at %s is missing CLAUDE.md, .claude/ or scripts/\n' "$source_dir" >&2
  exit 1
fi

copied=0
skipped=0

copy_file() {
  local src="$1"
  local dest="$2"
  local verb="copy"

  if [ "$src" = "$dest" ]; then
    skipped=$((skipped + 1))
    printf 'skip      %s (source)\n' "$dest"
    return 0
  fi

  if [ -e "$dest" ]; then
    if [ "$force" -eq 0 ]; then
      skipped=$((skipped + 1))
      printf 'skip      %s\n' "$dest"
      return 0
    fi
    verb="overwrite"
  fi

  copied=$((copied + 1))
  if [ "$dry_run" -eq 1 ]; then
    printf '%-9s %s\n' "would $verb" "$dest"
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  printf '%-9s %s\n' "$verb" "$dest"
}

printf 'Installing wippaCLAUDE into %s\n' "$project"

while IFS= read -r src; do
  relative="${src#"$source_dir"/}"
  copy_file "$src" "$project/$relative"
done < <(find "$source_dir/.claude" "$source_dir/scripts" -type f | LC_ALL=C sort)

copy_file "$source_dir/CLAUDE.md" "$project/CLAUDE.md"

wippa_dir="$project/.wippa"

if [ ! -d "$wippa_dir" ]; then
  if [ "$dry_run" -eq 1 ]; then
    printf '%-9s %s\n' "would mkdir" "$wippa_dir"
  else
    mkdir -p "$wippa_dir"
    printf '%-9s %s\n' "mkdir" "$wippa_dir"
  fi
fi

copy_file "$source_dir/.wippa/acceptance.example" "$wippa_dir/acceptance.example"

# The ledger template is installed only when absent, with or without --force.
if [ -e "$wippa_dir/PLAN.md" ]; then
  skipped=$((skipped + 1))
  printf 'skip      %s (never overwritten)\n' "$wippa_dir/PLAN.md"
else
  copied=$((copied + 1))
  if [ "$dry_run" -eq 1 ]; then
    printf '%-9s %s\n' "would copy" "$wippa_dir/PLAN.md"
  else
    cp "$source_dir/.wippa/PLAN.md" "$wippa_dir/PLAN.md"
    printf '%-9s %s\n' "copy" "$wippa_dir/PLAN.md"
  fi
fi

printf '\n%d installed, %d skipped\n' "$copied" "$skipped"

if [ "$dry_run" -eq 1 ]; then
  printf 'Dry run: nothing was written.\n'
fi

cat <<EOF

Next steps
1. Set the acceptance command in $wippa_dir/acceptance: one command, for example \`npm test\`.
2. Start Claude Code in $project with \`claude\`.
3. The PreToolUse and Stop hooks load at session start.
EOF
