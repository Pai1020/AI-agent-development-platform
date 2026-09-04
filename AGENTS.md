# Repository Guidelines

**This repository keeps a single source of truth for contributor and agent instructions: [`CLAUDE.md`](./CLAUDE.md). Read it before making any change.**

It is not Claude-specific — despite the filename, it documents this repository (a Claude Code plugin for an AI-assisted SDLC workflow) for any agent or human contributor, and covers:

- current implementation status of the Planning / Development / Knowledge stages
- directory conventions (`commands/`, `agents/`, `skills/`, `hooks/`, `docs/`, `.claude-plugin/`)
- build, test, and local-install commands
- coding style, naming, and testing rules
- branch, commit, and pull-request rules
- when you must read and update `docs/architecture/prompt-orchestration-determinism.md` before changing orchestration behaviour

Rules are deliberately **not** duplicated here: an earlier duplicate of the architecture-documentation rule had already drifted into a lossy subset of the original (see `docs/reports/2026-09-04-agents-md-claude-md-sharing-analysis.md`). Add or change rules in `CLAUDE.md` only.
