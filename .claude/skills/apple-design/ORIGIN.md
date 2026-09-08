# Origin

Vendored from https://github.com/dickwu/apple-design-skill at commit `d0bac1e`.

Contents: `SKILL.md` (review methodology) and `references/` (topic routing table
plus 53 guideline documents generalized from Apple's publicly available Human
Interface Guidelines).

The upstream README instructs `claude install-skill <path>`. That command does
not exist in Claude Code — skills are installed by placing a directory
containing `SKILL.md` under `.claude/skills/<name>/` (project scope, as here) or
`~/.claude/skills/<name>/` (personal scope).

To update: re-copy `SKILL.md` and `references/` from upstream and bump the
commit noted above.
