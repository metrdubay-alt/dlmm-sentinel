import { GrokBrowser } from "./services/grok-browser";
import { nextDueWorkspace } from "../shared/analysis/workspace";
import { PoolSource } from "./services/pool-source";
import { poolSnapshotSchema } from "../shared/analysis/pool-snapshot";
import { XBrowser } from "./services/x-browser";
import { WorkspaceStore } from "./services/workspace-store";
import { WorkspaceService } from "./services/workspace-service";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
  Notification,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { ZodError } from "zod";
import { commands, type Command } from "../shared/schemas/ipc";
import { openDatabase } from "./services/database";
import { AnalysisService } from "./services/analysis-service";
import { CredentialStore } from "./services/credentials";
import { LiveProviders } from "./providers/live";
import { DatabaseCache } from "./services/live-cache";
import { MoniBrowser } from "./services/moni-browser";
import { MoniStore } from "./services/moni-store";
import { SerialQueue } from "./services/serial-queue";
import { GmgnBrowser } from "./services/gmgn-browser";
import { GmgnStore } from "./services/gmgn-store";
const dev = !app.isPackaged && process.env.SENTINEL_DEV === "1";
if (process.env.SENTINEL_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.SENTINEL_DATA_DIR));
app.setName("DLMM Sentinel");
app.setAppUserModelId("com.dlmmsentinel.desktop");
let window: BrowserWindow | null = null;
async function start() {
  const db = await openDatabase(
    app.getPath("userData"),
    app.isPackaged
      ? path.join(process.resourcesPath, "migrations")
      : path.join(app.getAppPath(), "prisma", "migrations"),
  );
  const credentials = new CredentialStore(
    path.join(app.getPath("userData"), "api-credentials.enc"),
  );
  const moniBrowser = new MoniBrowser();
  const moniStore = new MoniStore(db);
  const moniQueue = new SerialQueue();
  const gmgnBrowser = new GmgnBrowser();
  const gmgnStore = new GmgnStore(db);
  const xBrowser = new XBrowser();
  const grokBrowser = new GrokBrowser();
  const poolSource = new PoolSource();
  const workspaceStore = new WorkspaceStore(db);
  const workspaceService = new WorkspaceService(
    workspaceStore,
    gmgnBrowser,
    gmgnStore,
    moniBrowser,
    moniStore,
    xBrowser,
  );
  let monitorBusy = false;
  const monitorTimer = setInterval(() => {
    if (monitorBusy || !window || window.isDestroyed()) return;
    monitorBusy = true;
    void moniQueue
      .run(async () => {
        if ((await service.settings()).demoMode) return;
        const states = await workspaceStore.list();
        const due = nextDueWorkspace(states, Date.now(), false);
        if (!due || !window || window.isDestroyed()) return;
        const result = await workspaceService.refresh(
          due.config.target,
          window,
          true,
        );
        if (result.events.length && Notification.isSupported())
          new Notification({
            title: `DLMM Sentinel · ${due.config.label || due.config.target.address.slice(0, 8)}`,
            body: result.events
              .map((e) => e.text)
              .join("\n")
              .slice(0, 500),
          }).show();
      })
      .catch(() => {
        console.error("monitor: проверка не выполнена");
      })
      .finally(() => {
        monitorBusy = false;
      });
  }, 30000);
  const service = new AnalysisService(
    db,
    new LiveProviders(new DatabaseCache(db), () => credentials.read()),
  );
  const rendererUrl = dev
    ? "http://127.0.0.1:5173/"
    : pathToFileURL(path.join(__dirname, "../renderer/index.html")).href;
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed =
      details.url.startsWith("file:") ||
      details.url.startsWith("devtools:") ||
      details.url.startsWith("data:") ||
      (dev && new URL(details.url).origin === "http://127.0.0.1:5173") ||
      (dev && details.url.startsWith("ws://127.0.0.1:5173/"));
    callback({ cancel: !allowed });
  });
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1050,
    minHeight: 700,
    title: "DLMM Sentinel",
    backgroundColor: "#0b1019",
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(app.getAppPath(), "build/icons/256.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  for (const key of Object.keys(commands) as Command[])
    ipcMain.handle(`sentinel:${key}`, async (event, payload: unknown) => {
      const handle = async () => {
        try {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url.split("#")[0] !== rendererUrl
          )
            throw new Error("Источник IPC не разрешён.");
          const parsed = commands[key].input.parse(payload);
          let data: unknown;
          switch (key) {
            case "grokStatus":
              data = grokBrowser.status();
              break;
            case "grokCancel":
              data = grokBrowser.cancel();
              break;
            case "grokRun": {
              if ((await service.settings()).demoMode)
                throw new Error("Grok отключён в демо-режиме.");
              const target = commands.grokRun.input.parse(parsed),
                current = await workspaceStore.report(target);
              const result = await grokBrowser.run(
                current.config,
                window,
                await gmgnBrowser.socialLinks(target),
              );
              data = await moniQueue.run(async () => {
                if ((await service.settings()).demoMode)
                  throw new Error("Grok остановлен: включён демо-режим.");
                return workspaceStore.saveGrok(result);
              });
              break;
            }
            case "workspaceList":
              data = await workspaceStore.list();
              break;
            case "workspaceSave":
              data = await workspaceStore.save(
                commands.workspaceSave.input.parse(parsed),
              );
              break;
            case "workspaceDelete": {
              const target = commands.workspaceDelete.input.parse(parsed);
              const status = grokBrowser.status();
              if (
                ["opening", "sending", "waiting"].includes(status.phase) &&
                status.target?.chain === target.chain &&
                status.target.address === target.address
              )
                throw new Error(
                  "Дождитесь завершения анализа Grok или отмените его.",
                );
              const current = await workspaceStore.report(target);
              const confirm = await dialog.showMessageBox(window, {
                type: "warning",
                title: "Удаление карточки",
                message: `Удалить карточку ${current.config.label || target.address}?`,
                detail: `${target.chain.toUpperCase()} · ${target.address}\nКарточка, её анализ Grok и снимки числовых данных и пулов будут удалены. Это действие нельзя отменить.`,
                buttons: ["Отмена", "Удалить"],
                defaultId: 0,
                cancelId: 0,
              });
              data =
                confirm.response === 1
                  ? await workspaceStore.remove(target)
                  : false;
              break;
            }
            case "workspaceReport":
              data = await workspaceStore.report(
                commands.workspaceReport.input.parse(parsed),
              );
              break;
            case "workspaceResearch":
              data = await workspaceStore.research({
                ...commands.workspaceResearch.input.parse(parsed),
                savedAt: new Date().toISOString(),
              });
              break;
            case "workspaceRefresh": {
              if ((await service.settings()).demoMode)
                throw new Error("Чтение источников отключено в демо-режиме.");
              const input = commands.workspaceRefresh.input.parse(parsed);
              data = (
                await workspaceService.refresh(
                  input.target,
                  window,
                  input.navigate,
                  input.scope,
                )
              ).report;
              break;
            }
            case "sourceConnections": {
              const [gmgn, x, moni, grok] = await Promise.all([
                gmgnBrowser.connection(),
                xBrowser.connection(),
                moniBrowser.connection(),
                grokBrowser.connection(),
              ]);
              // X and Grok share one session. A visible sign-out in either window overrides previous positive evidence.
              const auth =
                x.auth === "signed-out" || grok.auth === "signed-out"
                  ? "signed-out"
                  : x.auth === "signed-in" || grok.auth === "signed-in"
                    ? "signed-in"
                    : "unknown";
              data = { gmgn, x: { ...x, auth }, moni, grok: { ...grok, auth } };
              break;
            }
            case "sourceLogin": {
              if ((await service.settings()).demoMode)
                throw new Error("Источники отключены в демо-режиме.");
              const source = commands.sourceLogin.input.parse(parsed);
              data = await {
                gmgn: gmgnBrowser,
                x: xBrowser,
                moni: moniBrowser,
                grok: grokBrowser,
              }[source].openAccount(window);
              break;
            }
            case "workspaceSources": {
              const t = commands.workspaceSources.input.parse(parsed),
                r = await workspaceStore.report(t);
              data = {
                gmgn: gmgnBrowser.isOpen(
                  `https://gmgn.ai/${t.chain}/token/${t.address}`,
                ),
                x:
                  !!r.config.handle &&
                  xBrowser.isOpen(`https://x.com/${r.config.handle}`),
                moni:
                  !!r.config.handle &&
                  moniBrowser.isOpen(`https://app.moni.ai/${r.config.handle}`),
                grok: grokBrowser.isOpen("https://x.com/i/grok"),
              };
              break;
            }
            case "workspaceOpen": {
              if ((await service.settings()).demoMode)
                throw new Error("Источники отключены в демо-режиме.");
              const input = commands.workspaceOpen.input.parse(parsed),
                r = await workspaceStore.report(input.target);
              if (input.source === "gmgn")
                data = await gmgnBrowser.open(input.target, window);
              else if (input.source === "grok")
                data = await grokBrowser.openGrok(window);
              else {
                if (!r.config.handle)
                  throw new Error("Укажите профиль X в карточке токена.");
                data =
                  input.source === "x"
                    ? await xBrowser.open(r.config.handle, window)
                    : await moniBrowser.open(r.config.handle, window);
              }
              break;
            }
            case "poolsLatest": {
              const t = commands.poolsLatest.input.parse(parsed);
              const row = await db.liveCache.findUnique({
                where: { key: `pool-snapshot:${t.chain}:${t.address}` },
              });
              data = row
                ? poolSnapshotSchema.parse(JSON.parse(row.snapshotJson))
                : null;
              break;
            }
            case "poolsRefresh": {
              if ((await service.settings()).demoMode)
                throw new Error("Пулы отключены в демо-режиме.");
              const t = commands.poolsRefresh.input.parse(parsed);
              const snapshot = await poolSource.capture(t),
                key = `pool-snapshot:${t.chain}:${t.address}`;
              await db.liveCache.upsert({
                where: { key },
                create: { key, snapshotJson: JSON.stringify(snapshot) },
                update: { snapshotJson: JSON.stringify(snapshot) },
              });
              data = snapshot;
              break;
            }
            case "gmgnOpen":
            case "gmgnCapture": {
              if ((await service.settings()).demoMode)
                throw new Error(
                  "GMGN отключён в демо-режиме. Сохраните режим «Реальные источники».",
                );
              const target = commands.gmgnOpen.input.parse(parsed);
              data =
                key === "gmgnOpen"
                  ? await gmgnBrowser.open(target, window)
                  : await gmgnStore.save(await gmgnBrowser.capture(target));
              break;
            }
            case "gmgnHistory":
              data = await gmgnStore.history(
                commands.gmgnHistory.input.parse(parsed),
              );
              break;
            case "moniOpen":
            case "moniCapture": {
              if ((await service.settings()).demoMode)
                throw new Error(
                  "Moni доступен после сохранения режима «Реальные источники».",
                );
              const handle = commands.moniOpen.input.parse(parsed);
              data =
                key === "moniOpen"
                  ? await moniBrowser.open(handle, window)
                  : await moniStore.save(await moniBrowser.capture(handle));
              break;
            }
            case "moniHistory":
              data = await moniStore.history(
                commands.moniHistory.input.parse(parsed),
              );
              break;
            case "saveProspects":
              data = await service.saveProspects(parsed);
              break;
            case "credentialStatus":
              data = await credentials.status();
              break;
            case "clearCredentials":
              data = await credentials.clear();
              break;
            case "importCredentials": {
              const file = await dialog.showOpenDialog(window, {
                title: "Импорт API-настроек (не ключей кошелька)",
                properties: ["openFile"],
                filters: [{ name: "JSON", extensions: ["json"] }],
              });
              data =
                !file.canceled && file.filePaths[0]
                  ? await credentials.import(file.filePaths[0])
                  : await credentials.status();
              break;
            }
            case "scan":
              data = await service.scan(parsed);
              break;
            case "reports":
              data = await service.list();
              break;
            case "settings":
              data = await service.settings();
              break;
            case "saveSettings": {
              const confirm = await dialog.showMessageBox(window, {
                type: "warning",
                title: "Изменение правил",
                message: "Применить новые правила к следующим сканам?",
                detail:
                  "Текущие и сохранённые отчёты сохранят свою версию настроек.",
                buttons: ["Отмена", "Применить"],
                defaultId: 0,
                cancelId: 0,
              });
              if (confirm.response !== 1)
                throw new Error("Изменение отменено.");
              if (commands.saveSettings.input.parse(parsed).demoMode) {
                moniBrowser.close();
                gmgnBrowser.close();
                xBrowser.close();
                grokBrowser.close();
              }
              data = await service.saveSettings(parsed);
              break;
            }
            case "settingsHistory":
              data = await service.history();
              break;
            case "review":
              data = await service.review(parsed);
              break;
            case "openExternal": {
              const url = commands.openExternal.input.parse(parsed);
              const answer = await dialog.showMessageBox(window, {
                type: "warning",
                title: "Открыть внешнюю ссылку?",
                message: url,
                detail:
                  "Ссылка может быть опасной. Проверка URL не гарантирует безопасность. Не вводите seed phrase или приватные ключи.",
                buttons: ["Отмена", "Открыть в браузере"],
                defaultId: 0,
                cancelId: 0,
              });
              data = answer.response === 1;
              if (data) await shell.openExternal(url);
              break;
            }
            case "exportData": {
              const result = await dialog.showSaveDialog(window, {
                title: "Экспорт локальных данных",
                defaultPath: "dlmm-sentinel-export.json",
                filters: [{ name: "JSON", extensions: ["json"] }],
              });
              data = !result.canceled && !!result.filePath;
              if (data && result.filePath)
                await writeFile(
                  result.filePath,
                  JSON.stringify(await service.exportData(), null, 2),
                  "utf8",
                );
              break;
            }
            case "deleteData": {
              const answer = await dialog.showMessageBox(window, {
                type: "warning",
                message: "Удалить все локальные отчёты и настройки?",
                detail:
                  "Это действие необратимо. Экспортированные файлы останутся на диске.",
                buttons: ["Отмена", "Удалить"],
                defaultId: 0,
                cancelId: 0,
              });
              data = answer.response === 1;
              if (data) {
                await moniBrowser.clear();
                await gmgnBrowser.clear();
                await xBrowser.clear();
                grokBrowser.close();
                await service.deleteData();
                await credentials.clear();
              }
              break;
            }
          }
          return { ok: true, data: commands[key].output.parse(data) };
        } catch (error) {
          const message =
            error instanceof ZodError
              ? error.issues.map((i) => i.message).join(" ")
              : error instanceof Error
                ? error.message
                : "Неизвестная ошибка.";
          console.error(
            JSON.stringify({
              level: "error",
              event: "ipc",
              command: key,
              message,
            }),
          );
          return { ok: false, error: message };
        }
      };
      return [
        "workspaceList",
        "workspaceSave",
        "workspaceDelete",
        "workspaceReport",
        "workspaceResearch",
        "workspaceRefresh",
        "workspaceOpen",
        "sourceLogin",
        "poolsRefresh",
        "moniOpen",
        "moniCapture",
        "moniHistory",
        "gmgnOpen",
        "gmgnCapture",
        "gmgnHistory",
        "saveSettings",
        "deleteData",
      ].includes(key)
        ? moniQueue.run(handle)
        : handle();
    });
  window.on("closed", () => {
    clearInterval(monitorTimer);
    xBrowser.close();
    grokBrowser.close();
    gmgnBrowser.close();
    moniBrowser.close();
  });
  window.once("ready-to-show", () => window?.show());
  await window.loadURL(rendererUrl);
  console.log(
    JSON.stringify({
      level: "info",
      event: "desktop-ready",
      mode: dev ? "development" : "production",
      demo: (await service.settings()).demoMode,
    }),
  );
  app.on("before-quit", () => {
    clearInterval(monitorTimer);
    void db.$disconnect();
  });
}
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else {
  app.on("second-instance", () => {
    if (window && !window.isDestroyed()) {
      window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      console.error(
        JSON.stringify({
          level: "fatal",
          event: "startup",
          message: String(error),
        }),
      );
      dialog.showErrorBox("DLMM Sentinel — ошибка запуска", String(error));
      app.quit();
    });
}
app.on("window-all-closed", () => app.quit());
