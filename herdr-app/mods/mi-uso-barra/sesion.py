#!/usr/bin/env python3
"""sesion.py <cwd>: cache% y tokens del último turno de la sesión de Claude Code abierta en ese cwd."""
import glob, json, os, re, sys

cwd = sys.argv[1] if len(sys.argv) > 1 else ""
best = None
for cfg in ("~/.claude", "~/.claude-personal"):
    base = os.path.expanduser(cfg)
    for f in glob.glob(f"{base}/sessions/*.json"):
        try:
            s = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if s.get("cwd") != cwd or "sessionId" not in s:
            continue
        if best is None or s.get("updatedAt", 0) > best[0].get("updatedAt", 0):
            best = (s, base)
out = {}
if best:
    s, base = best
    tp = f"{base}/projects/{re.sub(r'[^A-Za-z0-9]', '-', cwd)}/{s['sessionId']}.jsonl"
    try:
        seen = {}
        for line in open(tp, encoding="utf-8"):
            try:
                e = json.loads(line)
            except ValueError:
                continue
            m = e.get("message") or {}
            if e.get("type") == "assistant" and m.get("usage"):
                seen[m.get("id") or e.get("uuid")] = m["usage"]
        us = list(seen.values())
        cr = sum(u.get("cache_read_input_tokens", 0) or 0 for u in us)
        cw = sum(u.get("cache_creation_input_tokens", 0) or 0 for u in us)
        inp = sum(u.get("input_tokens", 0) or 0 for u in us)
        tot = inp + cr + cw
        out["cache"] = round(100 * cr / tot) if tot else None
        if us:
            u = us[-1]
            out["turn"] = (u.get("input_tokens", 0) or 0) + (u.get("cache_creation_input_tokens", 0) or 0) + (u.get("output_tokens", 0) or 0)
        out["session"] = s.get("name")
    except OSError:
        out["error"] = "sin transcript"
print(json.dumps(out))
