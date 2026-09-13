# New Project Kickoff Checklist — Claude Code

> **Purpose:** get Claude Code genuinely productive in an *unfamiliar* codebase fast.
> Built for short/medium outsourcing engagements where you hop between **TS / Rust / Solidity** repos.
> Tip: keep this file in a personal templates/dotfiles dir and copy the relevant bits into each new client repo.

The single highest-leverage idea: **spend your first hour turning the repo's implicit knowledge into explicit context Claude can read every session** (a good `CLAUDE.md`), and **wire up tools that fetch context on demand** (DeepWiki). Everything below serves that.

---

## 0. Confidentiality gate (do this FIRST, every time)

Outsourcing = someone else's IP. Before pointing any AI tool at client code:

- [ ] Confirm the client/employer **permits AI coding tools** on this codebase.
- [ ] Confirm **which model endpoints** are allowed (some clients require self-hosted/on-prem only — that's where local open models like **Kimi K2.6 / Qwen via Ollama** come in).
- [ ] Add secrets to `deny` rules (Section 4) so the agent can never read `.env`, keys, etc.

If AI use isn't allowed on the client's code, stop here and use it only on your own scratch/learning repos.

---

## 1. Establish a green baseline (~15 min)

You can't trust an agent's changes if you don't know what "working" looks like.

- [ ] Clone, install deps, and run **build + test + lint** yourself once. Note the exact commands — you'll feed them to Claude in Section 2.
- [ ] Record the language toolchain versions (Node, Rust, solc/foundry).
- [ ] Confirm the test suite is green *before* you change anything.

---

## 2. Generate auto-context: `CLAUDE.md` (~15 min)

This is the project memory file Claude loads automatically every session.

- [ ] Run **`/init`** in Claude Code — it scans the repo and drafts a `CLAUDE.md` for you.
- [ ] **Review and edit** the draft (the auto-draft is a starting point, not gospel). Make sure it contains:
  - **Commands:** exact build / test / lint / typecheck / run commands (so Claude can self-verify its work).
  - **Architecture:** 3-6 bullets on how the code is laid out and where the entry points are.
  - **Conventions:** formatter, naming, error-handling, commit style.
  - **Do-not-touch:** generated files, vendored code, migrations, anything fragile.
  - **Gotchas:** non-obvious constraints a newcomer would trip on.
- [ ] Keep it tight. A bloated `CLAUDE.md` wastes context on every turn. Link big docs with `@path/to/doc.md` instead of pasting them.
- [ ] Personal-only notes (that shouldn't be committed) → `CLAUDE.local.md` or a `.claude/settings.local.json` (both gitignored).

> Habit to build: when you learn something surprising about the repo, add a line to `CLAUDE.md`. It compounds.

---

## 3. Wire up on-demand codebase understanding: DeepWiki (~5 min)

DeepWiki (by Cognition/Devin) auto-generates a browsable, queryable wiki for any **public** GitHub repo — architecture diagrams, module explanations, and a Q&A bot grounded in the source. Two ways to use it:

- [ ] **Quick browse:** swap `github.com` → `deepwiki.com` in any public repo URL.
- [ ] **From inside Claude Code (recommended):** add the official MCP server so Claude can query it mid-task:
  ```bash
  claude mcp add -s user -t http deepwiki https://mcp.deepwiki.com/mcp
  ```
  Then ask things like *"use deepwiki to explain how auth flows through this repo."* It exposes tools to read the wiki structure, read pages, and ask questions about a repo.
- [ ] Note: free for **public** repos only. Private client code → don't send it to a hosted wiki; rely on `CLAUDE.md` + local exploration instead (confidentiality, Section 0).

---

## 4. Configure `settings.json` (permissions + safety)

Settings cascade: `~/.claude/settings.json` (you, global) → `.claude/settings.json` (project, committed/shared) → `.claude/settings.local.json` (project, personal, gitignored). You already have global permissions — add **project-specific** allows so you're not approving the same safe commands all day, and **deny** rules to protect secrets.

Example `.claude/settings.local.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run test:*)",
      "Bash(npm run build:*)",
      "Bash(npm run lint:*)",
      "Bash(pnpm test:*)",
      "Bash(cargo test:*)",
      "Bash(cargo clippy:*)",
      "Bash(cargo build:*)",
      "Bash(forge test:*)",
      "Bash(forge build:*)",
      "Bash(git status)",
      "Bash(git diff:*)"
    ],
    "ask": [
      "Bash(git push:*)",
      "Bash(git commit:*)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./**/.env*)",
      "Read(./**/*.pem)",
      "Read(./**/id_rsa)",
      "Read(./**/secrets*)"
    ]
  }
}
```

- [ ] Pre-allow read-only / build / test / lint commands.
- [ ] Keep destructive or shared-state actions (`git push`, `git commit`, deploys) in `ask`.
- [ ] `deny` every secret path you can think of.

---

## 5. Optional: extra MCP servers & hooks (when you're ready)

- [ ] **More MCP servers** as needed: a docs server, a DB/read-only query server, your language server. Project-shared servers live in `.mcp.json` at the repo root.
- [ ] **Hooks** automate guardrails. Example — auto-format after every edit (`.claude/settings.json`):
  ```json
  {
    "hooks": {
      "PostToolUse": [
        { "matcher": "Edit|Write",
          "hooks": [ { "type": "command", "command": "npm run format --silent || true" } ] }
      ]
    }
  }
  ```
  (Don't bother with hooks until the basics above feel natural.)

---

## 6. Language-specific setup

Tell Claude the **exact** commands in `CLAUDE.md` so it can verify its own work.

**TypeScript / JS**
- [ ] Detect package manager from the lockfile: `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`→bun, else npm.
- [ ] Commands: install, `tsc --noEmit` (typecheck), test runner (vitest/jest), eslint, prettier.

**Rust**
- [ ] `cargo build`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`.
- [ ] Note workspace members + feature flags. Ensure rust-analyzer is the LSP.

**Solidity**
- [ ] Identify the toolchain: **Foundry** (`forge build` / `forge test` / `forge fmt`) vs **Hardhat** (`npx hardhat compile` / `test`).
- [ ] Pin the **solc version** in `CLAUDE.md`. Run static analysis (`slither .`) on changes.
- [ ] Security-sensitive: never let the agent handle private keys, deploy, or touch mainnet config. Add those paths to `deny`.

---

## 7. First-task ritual

- [ ] Pick a **small, well-defined** first task to calibrate trust.
- [ ] Use **plan mode** for anything non-trivial — review the plan before code runs.
- [ ] Make Claude **run the tests** it has commands for, and read the diff yourself.
- [ ] You own commits — review and `git commit` manually.

---

## The 8-step quick version

1. Confidentiality OK? Which endpoints allowed?
2. Build + test green on a clean checkout.
3. `/init` → review/edit `CLAUDE.md`.
4. Put exact build/test/lint commands in `CLAUDE.md`.
5. `claude mcp add -s user -t http deepwiki https://mcp.deepwiki.com/mcp` (public repos).
6. Project `settings.local.json`: pre-allow safe cmds, deny secrets.
7. Ask Claude for an architecture tour; capture key facts into `CLAUDE.md`.
8. Small first task in plan mode; verify with tests; you commit.
