export async function waitForGrokPage(options: {
  url: () => string;
  checkWindow: () => void;
  recover?: () => Promise<unknown>;
  pause?: () => Promise<void>;
}) {
  const pause =
    options.pause ?? (() => new Promise<void>((r) => setTimeout(r, 500)));
  for (let attempt = 0; attempt < (options.recover ? 2 : 1); attempt++) {
    for (let tick = 0; tick <= 10; tick++) {
      options.checkWindow();
      const raw = options.url();
      let u: URL;
      try {
        u = new URL(raw);
      } catch {
        throw new Error("Не удалось определить адрес страницы Grok.");
      }
      if (u.origin === "https://x.com" && u.pathname === "/i/grok") return;
      if (
        (u.hostname === "x.com" || u.hostname === "grok.com") &&
        /\/login|\/i\/flow\/login|\/sign-in/.test(u.pathname)
      )
        throw new Error(
          "Требуется вход в X/Grok. Откройте Grok кнопкой входа.",
        );
      // Only known landing/loading pages may settle or be reopened; never follow arbitrary URLs.
      const transitional =
        raw === "about:blank" ||
        (u.origin === "https://x.com" &&
          ["/", "/home", "/i/grok/"].includes(u.pathname)) ||
        (u.origin === "https://grok.com" &&
          ["/", "/settings/usage"].includes(u.pathname));
      if (!transitional)
        throw new Error(
          `Окно Grok перешло на другую страницу (${u.origin}${u.pathname}). Повторная отправка запроса не выполнялась.`,
        );
      if (tick < 10) await pause();
    }
    if (attempt === 0 && options.recover) {
      options.checkWindow();
      await options.recover();
    }
  }
  throw new Error(
    "Страница Grok не загрузилась после перехода. Откройте Grok для проверки; повторная отправка запроса не выполнялась.",
  );
}
