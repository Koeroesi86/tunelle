---
name: handoff
description: Write a short summary of the current work so a fresh session can continue after /clear. Trigger "handoff", "/handoff", or when the context of the session is large.
disable-model-invocation: true
model: haiku
allowed-tools: Bash
---

End a session cheaply: every call re-reads the whole context, a new session does not.

1. Run `npx tsx scripts/claude/handoff.ts <scratchpad>/handoff.md --next "…" --decisions "…" --unverified "…"`. It writes the branch, the uncommitted files, the commits and the pull request with its checks (at most 15 lines); you give only the three lines that the code and git do not hold: what is next, the decisions that are not in the code, and what is not verified.
2. Print the absolute path that it prints and tell the user to run `/clear` and then ask to read that file.

Do not summarise the conversation, quote code or paste logs; the diff and the pull request hold them.
