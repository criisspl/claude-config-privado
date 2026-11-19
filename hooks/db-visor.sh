#!/usr/bin/env bash
# PostToolUse: guarda la última consulta SQL (MCP de BD o mysql/psql/sqlite3 por Bash) para el mod mi-db de herdr-app.
# Guarda también el terminal (HC_TERMINAL_ID) para que el panel solo salga en su pestaña. Escribe ~/.config/herdr-app/data/db-ultima.json. Nunca bloquea (exit 0).
exec python3 -c '
import json, os, re, sys, time
try:
    d = json.load(sys.stdin)
    tool, ti = d.get("tool_name", ""), d.get("tool_input") or {}
    if tool == "Bash":
        cmd = ti.get("command", "")
        if not re.search(r"\b(mysql|psql|sqlite3)\b", cmd): sys.exit(0)
        q = cmd
    elif tool.startswith("mcp__") and re.search(r"mysql|postgres|sql|db", tool, re.I):
        if re.search(r"list_tables|describe|connect", tool): q = tool.split("__")[-1] + " " + json.dumps(ti, ensure_ascii=False)
        else: q = ti.get("query") or ti.get("sql") or json.dumps(ti, ensure_ascii=False)
    else: sys.exit(0)
    out = os.path.expanduser("~/.config/herdr-app/data")
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, "db-ultima.json.tmp")
    json.dump({"ts": int(time.time()), "tool": tool, "query": q, "terminal": os.environ.get("HC_TERMINAL_ID"), "response": d.get("tool_response")}, open(tmp, "w"), ensure_ascii=False)
    os.replace(tmp, os.path.join(out, "db-ultima.json"))
except Exception:
    pass
'
