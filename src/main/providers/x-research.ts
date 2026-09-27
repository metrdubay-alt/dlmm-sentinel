import { z } from "zod";
import { xProfileSchema, type LiveDetails } from "../../shared/schemas/live";
import { fetchX } from "./connected";
import type { LiveHttp } from "./http";
import type { Normalized } from "./normalize";

export function xHandle(value: string): string | undefined {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
        u.hostname,
      )
    )
      return;
    const match = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (
      !match ||
      [
        "i",
        "home",
        "search",
        "explore",
        "settings",
        "intent",
        "share",
        "login",
        "signup",
        "notifications",
        "messages",
      ].includes(match[1].toLowerCase())
    )
      return;
    return match[1].toLowerCase();
  } catch {
    return;
  }
}
function includesMint(text: string, mint: string) {
  return text.split(/[^1-9A-HJ-NP-Za-km-z]+/).includes(mint);
}
function failure(e: unknown) {
  const code = e instanceof Error ? e.message : "";
  if (/^HTTP_(401|403)$/.test(code))
    return `${code}: нет доступа к этому методу X.`;
  if (code === "RATE_LIMIT")
    return "RATE_LIMIT: лимит X исчерпан; повторите позже.";
  return "Проверка X не завершена: ошибка ответа, сети или таймаут.";
}
const profileResponse = z.object({
  data: z.object({
    id: z.string().regex(/^\d+$/),
    username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
    description: z.string().optional(),
    created_at: z.string().datetime().optional(),
    public_metrics: z
      .object({ followers_count: z.number().int().nonnegative().optional() })
      .optional(),
  }),
  errors: z.array(z.unknown()).optional(),
});
const timelineResponse = z.object({
  data: z
    .array(
      z.object({
        id: z.string().regex(/^\d+$/),
        text: z.string(),
        author_id: z.string().optional(),
        created_at: z.string().datetime(),
      }),
    )
    .optional(),
  meta: z.object({
    next_token: z.string().optional(),
    result_count: z.number().optional(),
  }),
  errors: z.array(z.unknown()).optional(),
});

async function fetchProfile(
  http: LiveHttp,
  mint: string,
  key: string,
  mode: "quick" | "deep",
  signal: AbortSignal,
  username: string,
  discoveredFrom: string,
) {
  const end = new Date(Date.now() - 30000).toISOString();
  const start = new Date(
    Date.parse(end) - (mode === "deep" ? 30 : 7) * 86400000,
  ).toISOString();
  const profile: z.infer<typeof xProfileSchema> = {
    username,
    url: `https://x.com/${username}`,
    discoveredFrom,
    identity: "NOT_CONFIRMED",
    mintInBio: false,
    mintInPosts: false,
    timelineComplete: false,
    pages: 0,
    start,
    end,
    posts: [],
    notes: [],
  };
  const raw: unknown[] = [];
  try {
    const params = new URLSearchParams({
      "user.fields": "description,created_at,public_metrics",
    });
    const response = await http.json(
      `https://api.x.com/2/users/by/username/${username}?${params}`,
      { headers: { Authorization: `Bearer ${key}` } },
      signal,
    );
    raw.push(response);
    const parsed = profileResponse.parse(response);
    if (parsed.errors?.length) throw new Error("PARTIAL_PROFILE");
    const user = parsed.data;
    if (user.username.toLowerCase() !== username)
      throw new Error("PROFILE_MISMATCH");
    Object.assign(profile, {
      id: user.id,
      description: user.description,
      createdAt: user.created_at,
      followers: user.public_metrics?.followers_count,
      mintInBio: includesMint(user.description ?? "", mint),
    });
    let next: string | undefined;
    // Keep the normalized map separate so duplicate page boundaries never inflate activity.
    const normalized = new Map<string, (typeof profile.posts)[number]>();
    for (let page = 0; page < (mode === "deep" ? 3 : 2); page++) {
      try {
        const q = new URLSearchParams({
          start_time: start,
          end_time: end,
          max_results: "100",
          "tweet.fields": "created_at,author_id",
          ...(next ? { pagination_token: next } : {}),
        });
        const value = await http.json(
          `https://api.x.com/2/users/${user.id}/tweets?${q}`,
          { headers: { Authorization: `Bearer ${key}` } },
          signal,
        );
        const r = timelineResponse.parse(value);
        raw.push(value);
        profile.pages++;
        for (const p of r.data ?? []) {
          if (p.author_id && p.author_id !== user.id) continue;
          if (
            Date.parse(p.created_at) < Date.parse(start) ||
            Date.parse(p.created_at) > Date.parse(end)
          )
            continue;
          normalized.set(p.id, {
            id: p.id,
            text: p.text,
            authorId: user.id,
            username,
            createdAt: p.created_at,
            url: `https://x.com/i/web/status/${p.id}`,
            warningTerms: [
              ...new Set(
                p.text
                  .toLowerCase()
                  .match(
                    /\b(scam|rug|insider|bundled|honeypot|phishing|fake)\b|dev sold/g,
                  ) ?? [],
              ),
            ],
          });
        }
        next = r.meta.next_token;
        if (r.errors?.length) {
          profile.error = "X вернул частичные ошибки timeline.";
          break;
        }
        if (!next) {
          profile.timelineComplete = true;
          break;
        }
      } catch (e) {
        profile.error = failure(e);
        break;
      }
    }
    profile.posts = [...normalized.values()];
    if (profile.posts.length > 0 || profile.timelineComplete) {
      profile.observed7d = profile.posts.filter(
        (p) => Date.parse(p.createdAt!) >= Date.parse(end) - 7 * 86400000,
      ).length;
      if (mode === "deep") profile.observed30d = profile.posts.length;
    }
    profile.mintInPosts = profile.posts.some((p) => includesMint(p.text, mint));
  } catch (e) {
    profile.error = failure(e);
  }
  if (profile.mintInBio || profile.mintInPosts) profile.identity = "MINT_MATCH";
  profile.notes.push(
    profile.identity === "MINT_MATCH"
      ? "Mint найден в профиле/публикациях: это совпадение текста, а не подтверждение связи с токеном. Владелец аккаунта и право представлять проект независимо не установлены."
      : "Ссылка ведёт на заявленный профиль, но точный mint в полученных данных не найден. Подлинность не установлена.",
  );
  profile.notes.push(
    "Ссылка взята из карточки DexScreener для base token. Метаданные и текст профиля могут контролироваться одним лицом; это не два независимых подтверждения. Тег и цитирование не означают endorsement.",
  );
  profile.notes.push(
    "История включает доступные ответы и репосты; это не число оригинальных публикаций. Удалённые и скрытые посты API может не вернуть.",
  );
  if (!profile.timelineComplete)
    profile.notes.push(
      "История получена не полностью; числа отражают только прочитанные публикации, а не полную активность за период.",
    );
  return { profile, raw };
}

export async function fetchXResearch(
  http: LiveHttp,
  mint: string,
  key: string,
  mode: "quick" | "deep",
  signal: AbortSignal,
  links: string[] | Promise<string[]>,
): Promise<Normalized> {
  const searchTask = fetchX(http, mint, key, mode, signal);
  const profileTask = (async () => {
    const candidates = new Map<string, string>();
    for (const link of await links) {
      const handle = xHandle(link);
      if (handle) candidates.set(handle, link);
    }
    const selected = [...candidates].slice(0, mode === "deep" ? 3 : 1);
    const results = [];
    for (const [name, url] of selected)
      results.push(
        await fetchProfile(http, mint, key, mode, signal, name, url),
      );
    return { results, total: candidates.size };
  })();
  const [search, profiles] = await Promise.allSettled([
    searchTask,
    profileTask,
  ]);
  const end = new Date(Date.now() - 30000).toISOString();
  const days = mode === "deep" ? 30 : 7;
  const social: LiveDetails["social"] =
    search.status === "fulfilled"
      ? search.value.details.social
      : {
          periodDays: days,
          start: new Date(Date.parse(end) - days * 86400000).toISOString(),
          end,
          complete: false,
          pages: 0,
          query: mint,
          posts: [],
        };
  const rows = profiles.status === "fulfilled" ? profiles.value.results : [];
  if (search.status === "rejected" && !rows.some((r) => r.profile.id))
    throw search.reason;
  const notes =
    search.status === "fulfilled"
      ? search.value.details.notes.filter(
          (s) => !s.startsWith("Подлинность официального профиля"),
        )
      : [
          "Поиск упоминаний mint не выполнен. История профиля ниже не заменяет поиск предупреждений по всему X.",
        ];
  notes.push(
    `Заявленных профилей: ${profiles.status === "fulfilled" ? profiles.value.total : "неизвестно"}; проверено ${rows.length}. Результаты связи и истории приведены отдельно.`,
  );
  if (rows.length > 1)
    notes.push(
      "Несколько заявленных аккаунтов: выбор официального требует отдельного подтверждения.",
    );
  notes.push(
    "Реальные роли авторов, боты, оплаченная реклама и принадлежность команде автоматически не установлены. Отсутствие жалоб в выборке не означает низкий риск.",
  );
  return {
    data: {},
    details: { social, xProfiles: rows.map((r) => r.profile), notes },
    rawResponse: {
      search: search.status === "fulfilled" ? search.value.rawResponse : null,
      profiles: rows.map((r) => r.raw),
    },
  };
}
