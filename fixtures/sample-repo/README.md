# sample-repo

A deliberately tiny target for agent runs. **Not** part of the GhostWriter build —
it is copied to a temp directory before an agent touches it (`src/testing/workspace.ts`).

- Zero dependencies. `npm test` runs Node's built-in test runner, so a copy is
  runnable the moment it is made — no install step, no network, no API key.
- Two functions, two tests, all green. That green baseline is the point: an agent
  change is only trustworthy if you know what "working" looked like first.

The Phase 1 (Wisp) acceptance criterion runs here:

    wisp "add a multiply function and a test for it"

Done when the agent's change leaves `npm test` passing in the temp copy.
