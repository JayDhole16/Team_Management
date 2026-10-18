---
description: Run code-reviewer and security-reviewer subagents on the work done since the last phase commit
disable-model-invocation: true
---

Review the work done in the current phase.

1. Run `git log --oneline -15` and `git diff --stat` to identify the changes since the last phase commit.
2. Delegate to the `code-reviewer` subagent and the `security-reviewer` subagent, giving each the list of changed files.
3. Combine their findings into one list: Must fix / Should fix / Nice to have, deduplicated, each with file:line.
4. Ask me whether to fix the Must-fix items now. Do not change code before I answer.
