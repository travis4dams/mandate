#!/usr/bin/env python3
"""PostToolUse hook: instant JSON syntax check for schema-governed content.

Deliberately Python, not node: node-based tooling has a history of hanging in
agent sessions on some workstations (see issue #103), and a hook must never
stall an edit. Full schema validation stays in `npm run validate` / CI; this
only catches syntax errors (the most common authoring mistake) at edit time.
"""
import json
import sys

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # malformed hook payload — never block the edit pipeline

path = (payload.get("tool_input") or {}).get("file_path", "")
if not path.endswith(".json"):
    sys.exit(0)
if "/content/" not in path and "/schemas/" not in path:
    sys.exit(0)

try:
    with open(path, encoding="utf-8") as f:
        json.load(f)
except FileNotFoundError:
    sys.exit(0)
except Exception as e:
    print(f"JSON syntax error in {path}: {e}", file=sys.stderr)
    sys.exit(2)  # exit 2 feeds the error back to Claude for an immediate fix
