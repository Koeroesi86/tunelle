---
name: handoff
description: Write a short summary of the current work so a fresh session can continue after /clear. Trigger "handoff", "/handoff", or when the context of the session is large.
disable-model-invocation: true
model: sonnet
allowed-tools: Bash, Write
---

End a session cheaply: every call re-reads the whole context, a new session does not.

1. Collect: `git branch --show-current`, `git status --short`, `git log --oneline origin/master..HEAD`, and the open pull request of the branch (`gh pr view --json number,url,statusCheckRollup` if there is one).
2. Write at most 15 lines to `handoff.md` in the scratchpad directory: the issue or pull request, the branch, what is done, what is next, the files that matter, the decisions that are not in the code, and what is not verified.
3. Print the absolute path and tell the user to run `/clear` and then ask to read that file.

Do not summarise the conversation, quote code or paste logs; the diff and the pull request hold them.
