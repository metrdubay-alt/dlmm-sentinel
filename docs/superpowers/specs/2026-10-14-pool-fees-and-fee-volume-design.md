# Pool fees and fee-volume metrics design

## Goal

Show two complementary signals without changing the existing 0–100 score:

1. Actual **5m Fees** for each discovered pool in the pool-efficiency table.
2. **Fees / Vol** for the token: GMGN Total Fees, converted to USD, divided by
   the cumulative chart volume from the first available candle through the
   current completed candle.

The signals help distinguish activity that actually produces protocol/pool fees
from volume that does not.

## User-facing behaviour

### Pool efficiency

Each row gains a `5m Fees` column populated from Fabriq. The colour policy is
applied only when the active profile is `runner`:

| Actual pool fee in the last 5 minutes | Presentation |
| --- | --- |
| `< $150` | red flag |
| `$150–< $300` | red |
| `$300–$450` | gray |
| `> $450` | green |

Other profiles show the amount but no Runner verdict. A missing individual
Fabriq match is rendered as `—`; it is not described as "Нет данных".

### Numeric analysis

Add a read-only signal named `Fees / Vol` with:

```text
(GMGN Total Fees × captured native-asset USD price) / GMGN all-time chart volume × 100
```

It uses the whole available life of the token: first candle through the most
recent completed candle. The existing visible GMGN Total Fees stays the source
for the numerator. The denominator comes from the GMGN chart's own Date and
Price Range volume result, read by the application after it opens the chart in
its background GMGN source window.

The ratio keeps the agreed display thresholds: `<0.35%` red flag,
`0.35–<0.50%` red, `0.50–0.75%` gray, and `>0.75%` green. It is informational:
it neither changes the numeric score nor creates a strategy veto in this
release.

If Fabriq finds fees for only some pools, display their actual amounts and a
coverage suffix such as `Fabriq: 2/3 пулов`. The `Fees / Vol` ratio does not
use Fabriq fees; it remains based on GMGN Total Fees and all-time chart volume.

## Architecture

### Fabriq reader

`FabriqBrowser` follows the security model already used by `GmgnBrowser`:

- a persistent, isolated Electron session;
- navigation restricted to `https://fabriq.trade`;
- downloads, permissions, popups, Node integration, and webviews disabled;
- a visible account/source button for the user to complete a Cloudflare check
  if Fabriq requests one.

Pool matching is by full pool address only, never ticker or displayed pair
name. The snapshot stores `fees5mUsd` and an explicit match state per row.
The existing pool capture remains authoritative for discovery and ordering.

### GMGN cumulative volume reader

The existing `GmgnBrowser` already opens the token page in a hidden persistent
session and reads the DOM. It will gain a narrowly scoped chart-reader step:

1. navigate to the token chart in its existing window;
2. select the oldest-to-current range using visible chart controls;
3. read the resulting range volume only when the page still belongs to the
   requested canonical token URL;
4. restore the normal five-minute card selection before returning.

The result is a typed optional measurement, including the first/last timestamps
and capture time. An ambiguous, stale, incomplete, or differently addressed
chart must produce `null`, never a guessed total.

## Failure handling

- Fabriq Cloudflare or a changed table leaves individual values as `—` and
  preserves previously saved snapshots.
- Partial Fabriq results retain the values found and always show `found/total`
  coverage.
- A missing or unreadable GMGN chart range shows `—` for `Fees / Vol`; the app
  does not open a visible window during ordinary analysis and does not ask the
  user to drag a chart.
- Existing GMGN card analysis, score, and strategy continue if this additional
  chart step fails.

## Testing and verification

- Unit tests for exact-address Fabriq matching, partial coverage, and every
  Runner 5m-fee boundary.
- Unit tests for Fees / Vol conversion and all four percentage boundaries,
  including missing numerator/denominator.
- DOM-reader fixture tests for accepting only a canonical GMGN token chart and
  rejecting ambiguous/missing range output.
- Renderer tests for the new pool column, coverage text, and numeric signal.
- Electron E2E fixture tests proving that the source windows remain isolated
  and that a chart failure does not erase an existing GMGN snapshot.
- Before release: `npm run verify`, affected Playwright tests, a packaged app
  smoke test, then installer and desktop-shortcut verification.

## Scope exclusions

- No GMGN API key, trading permission, wallet connection, or chart action by
  the user.
- No calculation of the third `V all-time > MC` signal in this change.
- No change to the existing score /100 or automatic entry decision.

## 0.3.73 implementation correction

The original DOM reader depended on a `data-sentinel-full-range` marker that
GMGN never creates. Live inspection confirmed that the chart lives in a
same-origin TradingView iframe and its own datafeed exposes USD candle volumes.
The reader now uses that chart datafeed, without changing chart settings:
completed UTC days plus completed minutes of the current UTC day. The current
daily candle is excluded to prevent double counting. A request preceding the
first daily candle must confirm no earlier data; a minute boundary anchor is
required for older tokens. Invalid values, navigation, truncated history and
timeouts return null. This replaces the unimplemented drawing-overlay approach;
it does not substitute 5m/1h volume or another provider's volume.
