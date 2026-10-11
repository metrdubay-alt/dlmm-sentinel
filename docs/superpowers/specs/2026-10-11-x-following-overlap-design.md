# X Following Overlap in Grok Research

## Purpose

Show a small, independent X signal in each Grok research card: how many
accounts followed by the signed-in user also follow the token's official X
profile. The signal helps the user quickly recognise whether the token has
already reached people they deliberately follow. It is descriptive only and
must not affect the Grok score, flags, or trading recommendation.

The visible form is a bordered badge in the upper-right corner of the Grok
research section:

```text
Among yours
13 / 210
follow @token
```

`13` is the verified intersection. `210` is the current total number of
accounts followed by the signed-in X account. Both values are snapshots and
may change on the next research run.

## Scope

Included:

- Recalculate the overlap each time a user runs Grok research.
- Use the existing authenticated, isolated X browser session and only public
  page DOM visible to that session; do not read cookies, passwords, page
  globals, or X private endpoints.
- Store the result and its observation time with the Grok result for the
  token.
- Render a compact, bordered status badge in the top-right of the Grok
  research header.
- Represent unavailable, incomplete, and error states honestly.
- Cover the new contracts, persistence, collector behaviour, and UI states
  with automated tests.
- Release the completed feature as the next DLMM Sentinel application build.

Excluded from this iteration:

- A block listing or summarising posts from followed accounts.
- Changes to the Grok prompt, score, flags, alerts, or monitoring decisions.
- X API credentials, paid API access, bulk scraping, and private X endpoints.
- Inventing zero values from an unavailable or truncated X list.

## User-visible behaviour

1. When Grok research starts, the badge is immediately present with a
   `Checking X…` state.
2. If the token's official handle is already known in the workspace,
   collection can run while Grok is working. If it is first identified by
   Grok, collection starts after that answer is validated and saved.
3. A successful complete collection displays the intersection, total followed
   count, target handle, and small observed-at timestamp.
4. An unavailable target handle, a signed-out X session, a DOM change, a
   truncated relationship list, or a collection failure displays `No data`
   with a short explanation. It never displays `0 / N` unless a complete
   collection explicitly verified zero matches.
5. Existing saved research has no overlap snapshot and renders `No data`;
   it remains otherwise unchanged.

## Data model and boundaries

Add a strict shared schema for an X following-overlap snapshot. It contains:

- target handle and source URL;
- observed-at ISO time;
- total followed count, intersection count, and the verified state;
- state: `complete`, `unavailable`, `incomplete`, or `error`;
- a short user-safe explanatory message for non-complete states.

The snapshot is an optional property of a Grok result, preserving compatibility
with prior persisted reports. The main-process collector owns DOM interaction;
the shared schema owns validation and display-safe types; the renderer only
renders the validated snapshot. IPC returns the usual updated workspace report
and introduces no renderer access to Electron or X.

The collector has one purpose: collect a complete relationship sample for the
signed-in X user and one target profile. It validates the current URL before
and after every DOM read, has bounded waits, and never retries an action that
could alter X state. It reads only X pages and does not follow, unfollow, post,
like, message, or modify any account.

## Collection flow

1. Obtain the current X account's following count and the target's official
   handle from the existing workspace/Grok result.
2. In the existing isolated X session, navigate only to allowlisted `x.com`
   pages and inspect the public DOM required to establish the mutual-follow
   relationship.
3. Accept a numeric result only when X exposes enough data to establish that
   the relationship list is complete. If the UI exposes only a limited or
   virtualised prefix (as observed for long following lists), return
   `incomplete`, not a partial count.
4. Save the snapshot with the Grok result. A collection failure does not
   discard an otherwise valid Grok response.
5. Return the refreshed workspace report so the badge transitions from
   checking to its final state.

The implementation must keep Grok token use unchanged: the overlap collector
does not add prompt text and does not send a second Grok request. It may add
X-page loading time to the research run.

## Failure handling

| Situation | Persisted state | Badge |
| --- | --- | --- |
| Complete verified relationship sample | `complete` | `13 / 210` |
| Official X handle is unknown | `unavailable` | `No data` + reason |
| App's X session is signed out | `unavailable` | `Sign in to X` |
| X exposes only a partial list | `incomplete` | `No data` + `X showed an incomplete list` |
| Navigation, DOM, or timeout failure | `error` | `No data` + safe short reason |

No failure may mutate the user's X account or replace a valid Grok answer.

## Renderer design

The existing `GrokAnalysis` header becomes a positioned header row. The action
buttons remain where they are; the badge is aligned to the upper-right of the
analysis content, has a clear border and compact contrast, and remains usable
on narrow windows. The content explicitly names the target handle to avoid
confusing a general follower count with a token-specific relationship.

## Verification

Before implementation, write failing tests for:

- parsing and rejecting malformed overlap snapshots;
- a complete `13 / 210` result;
- target handle unknown, signed-out, incomplete DOM list, and collector error;
- saving a Grok result with and without the optional snapshot;
- rendering complete, checking, and unavailable badge states;
- ensuring the Grok prompt and score/flag logic do not change.

Run focused unit/UI tests, the existing Grok and X-browser suites, TypeScript
typecheck, and the relevant end-to-end Grok scenario. Build and run the
packaged application before versioning and updating the installed release.

## Release

After verification, bump the application to the next patch version, create the
Windows installer, and replace the installed DLMM Sentinel build only after the
installer artifact has been built and its version has been verified. The
release must preserve the user's existing local data directory.
