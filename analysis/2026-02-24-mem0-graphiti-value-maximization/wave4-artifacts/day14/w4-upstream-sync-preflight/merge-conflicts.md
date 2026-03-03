# Upstream Sync: merge conflict decisions

This document records the conflict set and the resolution decisions applied while merging `upstream/main`
into `muqihang/main`.

## Conflict files

- `pnpm-lock.yaml`
  - Decision: take `upstream/main` lockfile as the source of truth.
  - Rationale: local branch did not intentionally change dependencies; prefer upstream consistency and
    let `pnpm install` reconcile if needed.

- `src/discord/monitor/provider.ts`
  - Decision: keep upstream's `botUserName` extraction, and keep local safety fallback for `botUserId`.
  - Resolution:
    - `botUserId = botUser?.id ?? applicationId`
    - `botUserName = botUser?.username?.trim() || botUser?.globalName?.trim() || undefined`
  - Rationale: keep richer identity info while preserving a deterministic id when Discord user lookup
    returns an empty payload.

- `src/discord/monitor/provider.proxy.test.ts`
  - Decision: base on upstream test suite (proxy WebSocket + proxy REST preflight), then re-add a guard
    regression test to ensure `registerClient` failures are swallowed and fallback `connect(false)` is
    attempted.
  - Rationale: upstream tests reflect the current gateway proxy metadata lookup behavior; local branch
    needs the extra assertion because we keep `withSafeGatewayRegister(...)` behavior.

- `vitest.config.ts`
  - Decision: keep both:
    - local analysis contract test globs (`analysis/Jarvis-Clawdbot活系统/contracts/**`)
    - upstream UI test include (`ui/src/ui/views/agents-utils.test.ts`)
  - Rationale: the include list is additive; missing paths are ignored, and both suites are relevant in
    this workspace.
