# Deterministic AI inference replay

An opt-in `ai.inference` provider derived exclusively from current canonical
session fixtures. It is test infrastructure, is absent from shipped profiles,
performs no network access, and fails closed when live requests diverge from the
recording or when a scenario is not fully consumed.

## Fixture contract

Each scenario supplies `session.jsonl`: line 1 is the current `SessionHeader`
and every following line is one current committed `SessionEvent`. Sequence and
time are mandatory. The loader runs the public session parsers and complete
history validator before deriving request scripts. A normal request requires a
terminal `assistant/message`.

An optional `replay.override.json` has one strict `calls` array. Each entry must
select exactly one request by zero-based `index`, canonical `requestId`, or both.
Supported actions are:

- `throw-before-chunk` with an exact structured provider error;
- `hang-until-cancel` with an optional ready marker;
- `replace` with replacement canonical chunks and optional finish reason;
- `patch` with explicitly indexed shallow chunk patches and optional finish reason.

An exact string `{{live:/json/pointer}}` binds a generated value from the live
semantic request. The same placeholder is reused in emitted chunks and tool
records. No other normalization is performed.

Auxiliary `generate()` calls require an explicit current `adapter/event` owned
by this provider with kind `auxiliary/generate`; unmarked calls fail. Concurrent
child sessions can bind through `bind({ kind: "child", parentSessionId, role,
ordinal })`, derived from the parent’s canonical role-bearing `subagent/start`
events rather than call order.

Every test must call `assertConsumed()` at teardown. It rejects unbound
scenarios, unread or missing requests, unused auxiliary calls, extra live calls,
semantic drift, and ambiguous sibling matching.

## Fixture workflow

Use the repository command against current-format fixtures only:

```text
pnpm replay:fixture record <source-session.jsonl> <scenario-dir>
pnpm replay:fixture replay <scenario-dir>
pnpm replay:fixture verify <scenario-dir>
pnpm replay:fixture refresh <scenario-dir>
```

`record` refuses to overwrite an existing fixture, sanitizes credentials and
private absolute paths, validates the result again, and writes a review report
containing paths and replacement kinds but never original values. `replay`,
`verify`, and `refresh` require strict `scenario.json` schema version 1 and run
its argument-array command with credential-like environment variables removed.
`verify` compares the declared semantic snapshots; `refresh` updates the
expected snapshot only after the scenario command and all fixture guards pass.
No command accepts or converts any other session format.
