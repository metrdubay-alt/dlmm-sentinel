// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { parseMoniCard } from "../../shared/analysis/moni";

vi.mock("electron", () => ({ BrowserWindow: class {}, session: {} }));
const { MONI_READ_SCRIPT } = await import("../../main/services/moni-browser");

// Structure copied from app.moni.ai on 2026-10-11: Moni Score and the newer Momentum Score share scoreBlock_scoreNumber.
const profile = (moniScore: string) => `
  <div class="accountHeaderBlock_links__x1"><a href="https://x.com/supercatsolgame">@supercatsolgame</a></div>
  <div class="scoreBlock_container__0Sr7U scoreModule_scoreBlockMoni__7hgny">
    <div class="scoreBlock_headerContainer__oEuSC"><span>Moni Score</span></div>
    <div class="scoreBlock_scoresContainer__unZw0">
      <div class="scoreBlock_scoreNumber__KTmjM"><span>${moniScore}</span></div>
      <div><span>+125</span><span class="scoreBlock_timeframe__2YVtN">/Day</span></div>
    </div>
  </div>
  <div class="scoreBlock_container__0Sr7U scoreModule_scoreBlock__3_Cx3">
    <div class="scoreBlock_headerContainer__oEuSC"><span>Momentum Score</span></div>
    <div class="scoreBlock_scoresContainer__unZw0">
      <div class="scoreBlock_scoreNumber__KTmjM"><span>12</span><span>%</span></div>
    </div>
  </div>
  <span class="smartsListHeader_smartFollowersCount__x1">183</span>`;

const readPage = (html: string) => {
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL("https://app.moni.ai/supercatsolgame");
  document.body.innerHTML = html;
  return (0, eval)(MONI_READ_SCRIPT);
};

it("reads Moni Score when the profile also shows Momentum Score", () => {
  const raw = readPage(profile("2180"));
  expect(
    parseMoniCard(raw, "supercatsolgame", "2026-10-11T12:00:00.000Z"),
  ).toMatchObject({ handle: "supercatsolgame", score: 2180, smarts: 183 });
});
