// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { GMGN_READ_SCRIPT } from "../../main/services/gmgn-dom";

it("reads Total Fees from the GMGN header outside the token scroll container", () => {
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL(
    "https://gmgn.ai/sol/token/2TKDNLwVTbhVVy7jCvSDz6ic4REAqQshZ9n9ZTxmpump",
  );
  document.body.innerHTML = `
    <div data-sentry-component="InfoItem">
      <span class="info-item-title">Total Fees</span>
      <span class="info-item-value"><i data-icon="IconSolanabal14pxS"></i>12.5</span>
    </div>
    <main id="GlobalScrollDomId"><span>Token details</span></main>`;

  expect((0, eval)(GMGN_READ_SCRIPT)).toMatchObject({
    info: { "Total Fees": "12.5" },
    feeIcon: "IconSolanabal14pxS",
  });
});
