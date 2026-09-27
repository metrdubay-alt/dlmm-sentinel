import type { XProfile } from "./x-browser";
import type { WorkspaceConfig } from "./workspace";

type Signal = { code: string; text: string; sources: string[] };
type Domain = { host: string; sources: string[] };
function safePost(url: string, handle: string) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "x.com" &&
      !u.username &&
      !u.password &&
      new RegExp(`^/${handle}/status/[0-9]+/?$`, "i").test(u.pathname)
    );
  } catch {
    return false;
  }
}

/** Evidence triage only: lexical matches never establish fraud, economics or a score. */
export function summarizeSocial(
  x: XProfile | null,
  target: WorkspaceConfig["target"],
  now: number,
) {
  const result = {
    status: !x ? "missing" : x.state,
    complete: false as const,
    addressInBio: false,
    activity: { visible7d: 0, visible30d: 0, undated: 0, future: 0 },
    signals: [] as Signal[],
    domains: [] as Domain[],
    description: "Снимок X не получен.",
  };
  if (!x) return result;
  if (x.state !== "available") {
    result.description = "Профиль недоступен в снимке X; причина неизвестна.";
    return result;
  }
  const addresses = x.bio.match(/[A-Za-z0-9]+/g) ?? [];
  result.addressInBio = addresses.some((a) =>
    target.chain === "bsc"
      ? a.toLowerCase() === target.address.toLowerCase()
      : a === target.address,
  );
  const seen = new Set<string>();
  const posts = x.posts.filter((p) => {
    if (
      p.author.toLowerCase() !== x.handle.toLowerCase() ||
      !safePost(p.url, x.handle)
    )
      return false;
    const key = new URL(p.url).pathname.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const reference = Math.min(now, Date.parse(x.observedAt));
  for (const p of posts) {
    if (!p.publishedAt) {
      result.activity.undated++;
      continue;
    }
    const age = reference - Date.parse(p.publishedAt);
    if (!Number.isFinite(age)) {
      result.activity.undated++;
      continue;
    }
    if (age < 0) {
      result.activity.future++;
      continue;
    }
    if (age <= 7 * 86400000) result.activity.visible7d++;
    if (age <= 30 * 86400000) result.activity.visible30d++;
  }
  const rules: [string, RegExp, string][] = [
    [
      "CLAIM_LANGUAGE",
      /\b(claim|airdrop|connect\s+(?:your\s+)?wallet)\b|подключ\S*\s+кошел|аирдроп/iu,
      "Упоминания claim / airdrop / подключения кошелька.",
    ],
    [
      "ECONOMIC_CLAIM",
      /\b(rewards?|payouts?|dividends?|revenue|distributed|buyback)\b|выплат|дивиденд|выручк/iu,
      "Заявления автора о выплатах, доходе или buyback.",
    ],
    [
      "RISK_LANGUAGE",
      /\b(scam|rug|phishing|honeypot|drainer|insider|bundled)\b|скам|фишинг/iu,
      "Упоминания scam / rug / phishing и других риск-терминов.",
    ],
  ];
  for (const [code, re, text] of rules) {
    const sources = posts.filter((p) => re.test(p.text)).map((p) => p.url);
    if (sources.length) result.signals.push({ code, text, sources });
  }
  const domains = new Map<string, Set<string>>();
  const collect = (text: string, source: string) => {
    for (const raw of text.match(
      /(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:\/[^\s<>]*)?/gi,
    ) ?? []) {
      try {
        const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
        const host = u.hostname.toLowerCase();
        if (["x.com", "twitter.com"].includes(host)) continue;
        if (!domains.has(host)) domains.set(host, new Set());
        domains.get(host)!.add(source);
      } catch {
        /* Not a parseable domain. */
      }
    }
  };
  // List destinations as text, never open or resolve claim links automatically.
  collect(x.website, x.sourceUrl);
  collect(x.bio, x.sourceUrl);
  for (const p of posts) collect(p.text, p.url);
  result.domains = [...domains].map(([host, sources]) => ({
    host,
    sources: [...sources],
  }));
  result.description = `@${x.handle}${x.followers == null ? "" : ` · подписчиков ${x.followers}`}${result.addressInBio ? " · адрес токена найден в bio" : ""}.`;
  return result;
}
