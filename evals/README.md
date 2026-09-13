# evals/

The regression net for agent behaviour. Unit tests prove a function is correct; evals prove the
*agent* still does the job after a prompt, model, or graph change — the thing that silently breaks.

Runs under vitest with everything else: `pnpm test`.

## The shape

```ts
import { runEvalSet, formatReport, contains, conformsTo, check } from './harness.js';

const cases = [
  { id: 'adds-a-test', input: 'add a test for sum()', checks: [contains('expect(')] },
];

const report = await runEvalSet(cases, (task) => runWisp(task));
console.log(formatReport(report));
expect(report.passRate).toBeGreaterThanOrEqual(0.8);
```

`subject` is any `(input) => Promise<output>` — one tool, one Wisp run, or a whole graph
invocation. The harness does not know what a model is.

## Checks

| Builder | Use for |
|---|---|
| `equals(expected)` | exact output, key-order independent |
| `contains(needle)` / `matches(regex)` | a required fragment of text |
| `conformsTo(zodSchema)` | structured output actually matching its schema |
| `check(name, predicate)` | anything else; the predicate may be async |

**Prefer deterministic checks.** An LLM judge is itself a flaky dependency — reach for it only when
the property genuinely cannot be expressed as a string, schema, or filesystem assertion (tone,
explanation quality). When you do, it is just `check('judge: is a valid plan', async (o) => ...)`
wrapping a model call — the harness needs no change, and the judge stays out of the no-key path.

## Rules of thumb

- **5-10 cases, then stop.** A small set you run on every change beats a large one you avoid.
- **Write the case with the bug.** When the agent gets something wrong, that failure becomes case
  number N+1 before you fix it.
- **A case is one behaviour.** `passRate` is only readable if each failure points somewhere.
- **Threshold, don't demand 100%.** Agent output is stochastic; assert a floor and watch it move.
- **Cases needing an API key gate on the key** (`describe.skipIf(!process.env.X)`) so the suite stays
  green offline.

## Status

`harness.ts` and its tests are complete and key-free. Real case sets arrive with Phase 2 (the
Poltergeist) — planner → worker → reviewer, plus a deliberately-introduced regression the set has
to catch.
