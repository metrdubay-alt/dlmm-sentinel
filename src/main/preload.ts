import { contextBridge, ipcRenderer } from "electron";
import { commands, type Command } from "../shared/schemas/ipc";
const bridge = Object.fromEntries(
  Object.keys(commands).map((key) => [
    key,
    async (input: unknown) => {
      const command = commands[key as Command];
      const parsed = command.input.parse(input);
      const result: unknown = await ipcRenderer.invoke(
        `sentinel:${key}`,
        parsed,
      );
      if (typeof result !== "object" || result === null || !("ok" in result))
        throw new Error("Некорректный ответ приложения.");
      if (result.ok !== true)
        throw new Error(
          "error" in result && typeof result.error === "string"
            ? result.error
            : "Ошибка приложения.",
        );
      return command.output.parse("data" in result ? result.data : undefined);
    },
  ]),
);
contextBridge.exposeInMainWorld("sentinel", Object.freeze(bridge));
