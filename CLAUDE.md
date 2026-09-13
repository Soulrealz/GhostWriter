# CLAUDE.md — GhostWriter

Agentic software factory built in four levels (Wisp → Poltergeist → Spectre → Revenant).
See @README.md for the architecture and @AGENTS.md for the rules every agent in this repo follows.
(Phase sequencing lives in the owner's local, gitignored planning notes.)

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` (pnpm — lockfile is `pnpm-lock.yaml`) |
| Run the agent | `pnpm start` |
| Test | `pnpm test` (vitest, run-once) · `pnpm test:watch` |
| Coverage | `pnpm coverage` |
| Typecheck | `pnpm typecheck` (`tsc --noEmit`, includes test files) |
| Build | `pnpm build` (`tsconfig.build.json` — emits `src/` only, tests excluded) |
| Inspect a run | `pnpm trace:report [--timeline] [file...]` — reads `.ghostwriter/ectoplasm/*.jsonl` |

Node 24, TypeScript 6, ESM (`"type": "module"`). Always verify a change with `pnpm typecheck && pnpm test`.

## How this repo is laid out

- `src/index.ts` — entry point. Currently a smoke call; becomes the Wisp CLI.
- `src/safety/` — guards the agent tools depend on, all pure and unit-tested.
  - `paths.ts` — `resolveWithinRoot`: keeps file access inside the repo root.
  - `allowlist.ts` — `assertCommandAllowed`: argv-prefix shell policy, no metacharacters.
  - `policy.ts` — `DEFAULT_COMMAND_POLICY` + `isSecretPath`: AGENTS.md §2 in executable form.
  - `redact.ts` — `redact` / `redactDeep`: strip secrets from anything leaving the process.
  - `budget.ts` — `Budget`: step, token, cost, and wall-clock ceilings for the agent loop.
- `src/context/toolResult.ts` — `truncateToolResult`, `previewJson`, `pickFields`. Keeps tool
  results from eating the context window.
- `src/observability/` — what a run cost and what it did.
  - `trace.ts` — `createTracer` + JSONL/memory sinks. Stamps and routes events; deliberately knows
    nothing about what a step *is* — the loop decides what to emit.
  - `cost.ts` — `MODEL_PRICING`, `estimateCostUsd`. Unpriced models throw rather than guess zero.
  - `report.ts` — reads traces back: `parseTraceLines`, `summariseRun`, `formatTimeline`.
- `src/testing/workspace.ts` — `withTempWorkspace(SAMPLE_REPO, fn)`. Disposable copy of a fixture so
  agent runs are reproducible and a path-escape bug wrecks a temp dir, not the repo.
- `fixtures/sample-repo/` — zero-dependency target repo (Node's built-in test runner, no install).
  The Phase 1 acceptance criterion runs here.
- `scripts/trace-report.ts` — CLI over `report.ts`. Read-only, no API key.
- `evals/` — deterministic eval harness (Phase 2). Runs under vitest alongside unit tests.
- `.ghostwriter/ectoplasm/` — run traces land here. Gitignored.
- `docker-compose.yml` — Neo4j for Phase 4. Not needed before then.
- `.github/workflows/ci.yml` — typecheck + test + build on push and PR. No secrets required.
- The README's `rituals/`, `memory/`, `.skills/`, `blueprints/` tree is **proposed**, not built.

## Conventions

- Tabs, single quotes, semicolons (match existing files).
- Zod for every tool argument schema and every structured output. `zod-to-json-schema` bridges to
  tool `input_schema`.
- Tool handlers **return** errors as tool results; they do not throw out of the agent loop. Both
  guard errors (`PathEscapeError`, `CommandDeniedError`) carry model-readable messages for exactly
  this. Let the model self-correct.
- Tests colocate as `src/**/*.test.ts` and import with the `.js` extension (ESM resolution).
- Commits are the human's. Do not run `git commit` or `git push`.

## Do not touch

- `.env` — secrets. It is in `deny` rules; read `.env.example` instead.
- `dist/` — build output.
- **The agent core.** The agent loop, tool definitions, and LangGraph state schemas are written by
  the repo owner by hand, in ~5-line chunks, as a deliberate learning exercise. Do not implement,
  complete, or "helpfully finish" these. Scaffolding, tests, guards, config, and docs around them
  are fair game — see `ghostwriter-wisp` skill for the chunk protocol.

## Gotchas

- `assertCommandAllowed` rejects all shell metacharacters, glob characters included. Commands go to
  `execFile` as argv — never to `exec` with a shell.
- `tsconfig.json` has no `rootDir`/`outDir` so it can typecheck `evals/` and `vitest.config.ts`;
  only `tsconfig.build.json` emits.
- `noUncheckedIndexedAccess` is on — indexing an array yields `T | undefined`.
- esbuild's postinstall is gated by pnpm's `onlyBuiltDependencies`. If vitest fails to start after a
  fresh install, run `pnpm rebuild esbuild`.
- Only `GOOGLE_GENERATIVE_AI_API_KEY` is configured. Anything needing LangSmith, E2B, Neo4j, or
  Anthropic keys cannot be verified end-to-end yet — say so rather than claiming it works.
- `MODEL_PRICING` (`src/observability/cost.ts`) carries a `PRICING_CHECKED` date. It holds verified
  Anthropic rates only — Gemini has no entry on purpose, so `estimateCostUsd('gemini-…')` throws
  until someone adds a rate they have actually checked. Do not invent prices.
- `redactDeep` blanks secret-shaped keys only when the value is a **string**. Numbers stay: an
  earlier version blanked `inputTokens` (it matches /TOKEN/) and silently zeroed every cost report.
