import type { BrowserWindow } from "electron";
export async function loadSourcePage(win: BrowserWindow, url: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      win.loadURL(url),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          if (!win.isDestroyed()) win.webContents.stop();
          reject(new Error("Источник не загрузился за 20 секунд."));
        }, 20000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
