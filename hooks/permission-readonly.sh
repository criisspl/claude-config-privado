#!/usr/bin/env bash
# permission-readonly.sh — Claude Code PermissionRequest/Bash hook
# Auto-approves read-only gh, git, jq, rg and wc commands (and pipes between them).
# Anything else: no output and exit 0, so the normal permission prompt decides.
# (exit 2 would DENY in PermissionRequest, so it is never used here.)

set -uo pipefail

input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
[[ "$(echo "$input" | jq -r '.tool_name // ""')" == "Bash" ]] || exit 0
command=$(echo "$input" | jq -r '.tool_input.command // ""')
[[ -z "${command//[[:space:]]/}" ]] && exit 0

# Chaining, redirection, substitution, background, newlines: never approve (checked on the raw text)
case "$command" in
  *';'* | *'&'* | *'>'* | *'<'* | *'`'* | *'$('* | *'${'* | *$'\n'* | *$'\r'* | *'||'*) exit 0 ;;
esac

# Words outside quotes decide the command and subcommand
bare=$(echo "$command" | sed -E "s/'[^']*'|\"[^\"]*\"//g")

deny() { exit 0; }

check_git() {
  local sub="${1:-}"; shift || true
  case "$sub" in
    status | diff | log | show | blame | rev-parse | ls-files | ls-tree | grep | shortlog | describe | cat-file | merge-base | rev-list | diff-tree | name-rev) ;;
    branch)
      local a
      for a in "$@"; do
        case "$a" in --show-current | -a | -r | -v | -vv | --list | -l) ;; *) deny ;; esac
      done ;;
    *) deny ;;
  esac
  local a
  for a in "$@"; do
    case "$a" in --output | --output=* | -O | -O* | --open-files-in-pager | --open-files-in-pager=*) deny ;; esac
  done
}

check_gh() {
  local cmd="${1:-} ${2:-}"; shift 2 2>/dev/null || shift $# || true
  local a
  case "$cmd" in
    "pr view" | "pr list" | "pr diff" | "pr checks" | "pr status" | "issue view" | "issue list" | "issue status" \
      | "run view" | "run list" | "repo view" | "release view" | "release list" | "auth status")
      for a in "$@"; do
        case "$a" in --web | -w) deny ;; esac
      done ;;
    "api "*)
      # method: only an explicit GET; anything that sends a body implies POST
      local raw_rest
      raw_rest=$(echo "$command" | sed -E 's/^.*gh[[:space:]]+api//; s/\|.*//')
      raw_rest=$(echo "$raw_rest" | sed -E "s/(-X|--method)(=|[[:space:]]+)[\"']?GET[\"']?//g")
      case "$raw_rest" in *-X* | *--method*) deny ;; esac
      for a in "$@"; do
        case "$a" in -f | -F | -f* | -F* | --field | --field=* | --raw-field | --raw-field=* | --input | --input=* | graphql) deny ;; esac
      done ;;
    *) deny ;;
  esac
}

IFS='|' read -ra segs <<<"$bare"
# a trailing "|" leaves no empty last element in read -a, so detect it explicitly
[[ "$bare" == *'|' || "$bare" == '|'* ]] && deny
[[ ${#segs[@]} -eq 0 ]] && deny

for seg in "${segs[@]}"; do
  read -ra w <<<"$seg"
  [[ ${#w[@]} -eq 0 ]] && deny
  case "${w[0]}" in
    git)
      [[ ${#w[@]} -ge 2 ]] || deny
      check_git "${w[@]:1}" ;;
    gh)
      [[ ${#w[@]} -ge 2 ]] || deny
      if [[ "${w[1]}" == "api" ]]; then
        [[ ${#w[@]} -ge 3 ]] || deny
        check_gh "api" "x" "${w[@]:2}" # "api x" matches the api branch; args start after the subcommand
      else
        [[ ${#w[@]} -ge 3 ]] || deny
        check_gh "${w[1]}" "${w[2]}" "${w[@]:3}"
      fi ;;
    jq | wc) ;;
    rg)
      for a in "${w[@]:1}"; do
        case "$a" in --pre | --pre=* | --hostname-bin | --hostname-bin=*) deny ;; esac
      done ;;
    *) deny ;;
  esac
done

printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
exit 0
