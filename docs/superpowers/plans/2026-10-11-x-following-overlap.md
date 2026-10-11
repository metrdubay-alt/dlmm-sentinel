# X Following Overlap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a validated `matched / followed` X-overlap badge in each Grok research card without changing Grok prompts, scores, or account state.

**Architecture:** A strict shared overlap-snapshot contract is stored as an optional part of `GrokResult`. A main-process collector reads only visible DOM from the authenticated `persist:sentinel-x` session, returns a complete result only after proving its page sample is complete, and otherwise returns an explicit non-numeric state. The existing Grok IPC orchestration saves the normal Grok answer even if overlap collection cannot complete; the renderer renders the validated snapshot separately.

**Tech Stack:** Electron 41, TypeScript 5.9, React 19, Zod 3, Prisma-backed local cache, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-x-following-overlap-design.md`

## Global Constraints

- Use only public X DOM visible in the existing isolated authenticated session; never inspect cookies, credentials, page globals, or private endpoints.
- The collector must not follow, unfollow, post, like, message, or otherwise mutate X state.
- A numeric overlap is valid only for a complete verified sample; incomplete, unavailable, and error states must never be rendered as zero.
- Do not change `buildGrokPrompt`, Grok scoring, flags, alerts, or trading recommendations.
- Preserve compatibility with reports saved before the optional snapshot existed.
- Produce the next patch release only after verification, while retaining the existing local data directory.

## Review Focus

- Long or virtualised X lists must become `incomplete`, not a partial numeric result — covered in Task 2 parser/collector tests.
- The application X session may be signed out even when another browser is signed in — covered in Task 2 and Task 3 tests.
- A Grok result found without a configured X handle must still save, then attempt overlap only after a validated discovered handle exists — covered in Task 3 tests.
- Collection failures must not replace a valid previous Grok result or fail the completed Grok answer — covered in Task 3 tests.
- Old stored Grok results and narrow layouts must show a clear non-numeric badge without crashing — covered in Task 1 and Task 4 tests.

---

## File Structure

- Create `src/shared/analysis/x-following-overlap.ts` — strict persisted snapshot schema, type, and pure DOM-payload parser.
- Modify `src/shared/analysis/grok.ts` — make `followingOverlap` an optional, backward-compatible part of `GrokResult`.
- Modify `src/main/services/x-browser.ts` — collect the signed-in account's following total and target mutual-follow sample through bounded, allowlisted X DOM navigation.
- Modify `src/main/services/grok-browser.ts` — expose an overlap-checking status alongside the existing Grok job status.
- Modify `src/main/main.ts` — coordinate Grok and overlap collection, preserve a valid Grok result on collection failure, and persist the combined result.
- Modify `src/renderer/pages/GrokAnalysis.tsx` — render a right-aligned accessible overlap badge and its checking/error states.
- Modify `src/renderer/styles/global.css` — responsive visual treatment for the bordered badge.
- Create `src/tests/unit/x-following-overlap.test.ts` — contract and DOM-payload parser tests.
- Modify `src/tests/unit/grok.test.ts` — backward compatibility and result-schema tests.
- Modify `src/tests/unit/x-browser.test.ts` — bounded collector-state fixtures.
- Modify `src/tests/e2e/grok.spec.ts` — complete and unavailable badge assertions using the existing Electron/X fixture.
- Modify `package.json` and `package-lock.json` — final patch version bump to `0.3.59` after all functional work is verified.

### Task 1: Persisted overlap contract

**Files:**
- Create: `src/shared/analysis/x-following-overlap.ts`
- Modify: `src/shared/analysis/grok.ts`
- Test: `src/tests/unit/x-following-overlap.test.ts`
- Test: `src/tests/unit/grok.test.ts`

**Interfaces:**
- Produces `xFollowingOverlapSchema` and `type XFollowingOverlap`.
- Produces an optional `followingOverlap?: XFollowingOverlap` property on `GrokResult`.
- Consumes `moniHandleSchema` and existing HTTPS URL validation conventions.

- [ ] **Step 1: Write failing contract tests for complete, unavailable, incomplete, and error snapshots**

```ts
expect(xFollowingOverlapSchema.parse(complete)).toMatchObject({
  state: "complete",
  matchedFollowing: 13,
  followingTotal: 210,
});
expect(() => xFollowingOverlapSchema.parse({ ...complete, matchedFollowing: 211 })).toThrow();
expect(() => xFollowingOverlapSchema.parse({ ...incomplete, matchedFollowing: 0 })).toThrow();
```

- [ ] **Step 2: Run the new contract test to verify it fails**

Run: `npm test -- src/tests/unit/x-following-overlap.test.ts`

Expected: FAIL because the module and schema do not exist.

- [ ] **Step 3: Implement `xFollowingOverlapSchema` and `XFollowingOverlap` in `src/shared/analysis/x-following-overlap.ts`**

Use a discriminated Zod union. `complete` requires `targetHandle`, HTTPS `sourceUrl`, ISO `observedAt`, non-negative integer `followingTotal`, non-negative integer `matchedFollowing`, and `matchedFollowing <= followingTotal`. `unavailable`, `incomplete`, and `error` require ISO `observedAt` plus a bounded, user-safe message and prohibit numeric counts. Make every branch `.strict()`.

- [ ] **Step 4: Extend `grokResultSchema` with optional `followingOverlap` and add failing/passing compatibility tests**

Existing Grok fixture data without this field must still parse. A fixture containing a complete snapshot must round-trip unchanged. Do not alter the prompt or answer parsing.

- [ ] **Step 5: Run focused schema tests**

Run: `npm test -- src/tests/unit/x-following-overlap.test.ts src/tests/unit/grok.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the contract change**

```bash
git add src/shared/analysis/x-following-overlap.ts src/shared/analysis/grok.ts src/tests/unit/x-following-overlap.test.ts src/tests/unit/grok.test.ts
git commit -m "feat: define X following overlap snapshot"
```

### Task 2: Read-only X overlap collector

**Files:**
- Modify: `src/main/services/x-browser.ts`
- Modify: `src/shared/analysis/x-following-overlap.ts`
- Test: `src/tests/unit/x-following-overlap.test.ts`
- Test: `src/tests/unit/x-browser.test.ts`

**Interfaces:**
- Consumes `XFollowingOverlap` from Task 1.
- Produces `XBrowser.collectFollowingOverlap(targetHandle: string, parent: BrowserWindow): Promise<XFollowingOverlap>`.
- Produces pure `parseXFollowingOverlapPayload(input: unknown, targetHandle: string, observedAt: string): XFollowingOverlap` for DOM-fixture testing.

- [ ] **Step 1: Write failing parser tests for a complete payload, signed-out page, target mismatch, virtualised prefix, and timeout/DOM error payloads**

```ts
expect(parseXFollowingOverlapPayload(completePayload, "example", at)).toMatchObject({
  state: "complete",
  followingTotal: 210,
  matchedFollowing: 13,
});
expect(parseXFollowingOverlapPayload(partialPayload, "example", at).state).toBe("incomplete");
```

- [ ] **Step 2: Run the parser tests to verify they fail**

Run: `npm test -- src/tests/unit/x-following-overlap.test.ts src/tests/unit/x-browser.test.ts`

Expected: FAIL because the payload parser and collector do not exist.

- [ ] **Step 3: Implement the strict raw payload parser in `src/shared/analysis/x-following-overlap.ts`**

The raw payload must include the final URL, target identity, signed-in/blocked indication, following total text, mutual-count text or rows, and an explicit complete/partial marker. Validate origin and target handle before deriving a snapshot. Return `incomplete` whenever the DOM indicates virtualisation, an unloaded next page, a bounded-scroll timeout, or an unknown end-of-list state.

- [ ] **Step 4: Implement `collectFollowingOverlap` in `src/main/services/x-browser.ts`**

Add a dedicated public-DOM script and bounded navigation/scroll loop. Reuse `allowedX`, the isolated `persist:sentinel-x` session, URL-before/after checks, hidden background window behaviour, and the existing safe browser lifecycle. Read the signed-in user's following total and target relationship data only from displayed X pages. Do not click controls that mutate account state. Convert every expected access limitation into a non-complete snapshot; reserve thrown errors for unexpected transport/lifecycle failures, which Task 3 converts to `error`.

- [ ] **Step 5: Run collector unit tests**

Run: `npm test -- src/tests/unit/x-following-overlap.test.ts src/tests/unit/x-browser.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the collector change**

```bash
git add src/main/services/x-browser.ts src/shared/analysis/x-following-overlap.ts src/tests/unit/x-following-overlap.test.ts src/tests/unit/x-browser.test.ts
git commit -m "feat: collect X following overlap"
```

### Task 3: Coordinate Grok and X collection without changing Grok semantics

**Files:**
- Modify: `src/shared/analysis/grok.ts`
- Modify: `src/main/services/grok-browser.ts`
- Modify: `src/main/main.ts`
- Test: `src/tests/unit/grok.test.ts`
- Test: `src/tests/e2e/grok.spec.ts`

**Interfaces:**
- Consumes `XBrowser.collectFollowingOverlap` from Task 2 and optional `GrokResult.followingOverlap` from Task 1.
- Produces a Grok status shape that exposes `followingOverlap: "idle" | "checking" | "complete" | "unavailable" | "incomplete" | "error"` without changing `phase` semantics.
- Produces a persisted Grok result with a complete or explicit non-complete overlap snapshot.

- [ ] **Step 1: Write failing orchestration tests for configured handles, Grok-discovered handles, signed-out X, and collector failures**

Use the existing Electron fixture to assert that a successful Grok response is saved when the X collector reports unavailable/error, and that the resulting report carries the corresponding overlap state. Assert the prompt remains a single send and does not contain any overlap instructions.

- [ ] **Step 2: Run the focused Grok test to verify it fails**

Run: `npm test -- src/tests/unit/grok.test.ts && npm run test:e2e -- src/tests/e2e/grok.spec.ts`

Expected: FAIL because no overlap state is reported or saved.

- [ ] **Step 3: Extend the Grok status schema and `GrokBrowser` status transitions**

Set `checking` when the coordinator starts a collection; retain existing `opening`, `sending`, `waiting`, `complete`, and `error` meanings. Never mark the Grok job as failed solely because an overlap collection is unavailable or incomplete.

- [ ] **Step 4: Coordinate overlap collection in the `grokRun` IPC handler in `src/main/main.ts`**

Start collection in parallel if `current.config.handle` exists. After `grokBrowser.run` returns, select its validated discovered handle when no configured handle existed; then collect if it has not already run. Normalize expected collector failures into the `error` snapshot, attach the snapshot to the Grok result, and pass the combined result to `workspaceStore.saveGrok`. Keep the existing single Grok send, serial persistence queue, and demo-mode guard unchanged.

- [ ] **Step 5: Run Grok unit and Electron tests**

Run: `npm test -- src/tests/unit/grok.test.ts && npm run test:e2e -- src/tests/e2e/grok.spec.ts`

Expected: PASS. The fixture observes one Grok send and saved reports retain a valid Grok answer for all collector states.

- [ ] **Step 6: Commit the orchestration change**

```bash
git add src/shared/analysis/grok.ts src/main/services/grok-browser.ts src/main/main.ts src/tests/unit/grok.test.ts src/tests/e2e/grok.spec.ts
git commit -m "feat: attach X overlap to Grok research"
```

### Task 4: Render the Grok overlap badge

**Files:**
- Modify: `src/renderer/pages/GrokAnalysis.tsx`
- Modify: `src/renderer/styles/global.css`
- Modify: `src/tests/e2e/grok.spec.ts`

**Interfaces:**
- Consumes `WorkspaceReport.grok.followingOverlap` and Grok status overlap state from Task 3.
- Produces accessible `aria-label="Подписки из вашей ленты"` markup with complete, checking, and non-complete states.

- [ ] **Step 1: Write failing UI assertions in the existing Grok Electron test**

```ts
await expect(page.getByLabel("Подписки из вашей ленты")).toContainText("13 / 210");
await expect(page.getByLabel("Подписки из вашей ленты")).toContainText("@example");
await expect(page.getByLabel("Подписки из вашей ленты")).toContainText("Нет данных");
```

- [ ] **Step 2: Run the Grok Electron test to verify it fails**

Run: `npm run test:e2e -- src/tests/e2e/grok.spec.ts`

Expected: FAIL because the badge is absent.

- [ ] **Step 3: Implement the badge in `src/renderer/pages/GrokAnalysis.tsx`**

Place it in a header row at the upper-right of the Grok analysis. A complete snapshot shows `Среди твоих`, `matchedFollowing / followingTotal`, `подписаны на @handle`, and the observed time. While status is `checking`, show `Проверяю X…`. All non-complete/absent states show `Нет данных` and their safe explanatory copy. Do not render a numeric fallback and do not alter score, flags, or sources.

- [ ] **Step 4: Add responsive border/contrast rules in `src/renderer/styles/global.css`**

Keep controls readable at the current minimum window width and stack the badge below the action row only when the header cannot fit horizontally.

- [ ] **Step 5: Run UI and relevant unit tests**

Run: `npm run test:e2e -- src/tests/e2e/grok.spec.ts && npm test -- src/tests/unit/grok-social-display.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the renderer change**

```bash
git add src/renderer/pages/GrokAnalysis.tsx src/renderer/styles/global.css src/tests/e2e/grok.spec.ts
git commit -m "feat: show X following overlap in Grok"
```

### Task 5: Verify, package, and update the installed build

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes all completed feature work.
- Produces a verified `0.3.59` NSIS Windows installer and an installed application whose ProductVersion is `0.3.59.0`.

- [ ] **Step 1: Run the full automated verification suite before versioning**

Run: `npm run verify`

Expected: PASS for lint, typecheck, all Vitest tests, build, and `scripts/verify-build.ts`.

- [ ] **Step 2: Run the targeted packaged Grok smoke test**

Run: `npm run test:e2e -- src/tests/e2e/grok.spec.ts`

Expected: PASS, including complete and unavailable overlap badge states.

- [ ] **Step 3: Bump the package version to `0.3.59` without creating a Git tag**

Run: `npm version 0.3.59 --no-git-tag-version`

Expected: `package.json` and `package-lock.json` both report `0.3.59`.

- [ ] **Step 4: Build and verify the Windows installer**

Run: `npm run dist:win`

Expected: an NSIS installer in `release/` with application version `0.3.59`; verify the installer hash and installed executable ProductVersion before replacing the prior local installation.

- [ ] **Step 5: Install the verified artifact while preserving the user data directory, then launch a smoke check**

Confirm the existing sentinel data directory remains intact and the launched application reports version `0.3.59`. Do not perform X actions during this check.

- [ ] **Step 6: Commit the release metadata**

```bash
git add package.json package-lock.json
git commit -m "chore: release v0.3.59"
```

## Plan Self-Review

- Spec coverage: Tasks 1–4 cover the contract, collection, orchestration, rendering, explicit failure states, compatibility, and automated verification. Task 5 covers the requested versioned installer update and local-data preservation.
- Step scan: every task follows a failing test, failure verification, minimal named implementation, passing verification, and commit sequence.
- Type consistency: Task 1 defines the snapshot used by Task 2 and optional Grok result property used by Tasks 3–4; Task 3 owns the only status extension and persistence attachment.
- Review focus: each listed failure mode is assigned to a concrete task and test surface.
- Proportion: the plan names interfaces and constraints without duplicating implementation bodies.
