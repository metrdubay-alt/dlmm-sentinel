import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TransferFee } from "../../shared/analysis/transfer-fee";
vi.stubGlobal("window", { sentinel: {} });
const {TransferFeeWarning}=await import("../../renderer/pages/TransferFeeWarning");
const base={observedAt:"2026-09-28T00:00:00.000Z",source:"Solana RPC"};
const render=(fee?:TransferFee)=>renderToStaticMarkup(createElement(TransferFeeWarning,{fee}));
it("shows nothing for missing, unknown, absent and configured zero fees",()=>{
 for(const fee of [undefined,{...base,status:"unknown" as const,reason:"недоступна"},{...base,status:"none" as const},{...base,status:"configured" as const,percent:0,nextPercent:0}]) expect(render(fee)).toBe("");
});
it("shows yellow warning only for detected current or scheduled positive fee",()=>{
 expect(render({...base,status:"configured",percent:3})).toContain("!!! Комиссия за перевод токена: 3%");
 expect(render({...base,status:"configured",percent:0,nextPercent:3,nextEpoch:20})).toContain("Запланировано: 3%");
});
