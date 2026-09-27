import { safeStorage } from "electron";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { z } from "zod";
import { validateRpcEndpoint } from "../providers/http";
const credentialSchema = z
  .object({
    xBearerToken: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    gmgnKey: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    bubblemapsKey: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    rpcEndpoint: z.string().max(2048).optional(),
    rugcheckKey: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
  })
  .strict();
export class CredentialStore {
  constructor(private file: string) {}
  async read() {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error("Не удалось прочитать настройки API.");
    }
    try {
      return credentialSchema.parse(
        JSON.parse(safeStorage.decryptString(bytes)),
      );
    } catch {
      throw new Error(
        "Не удалось расшифровать настройки API. Импортируйте ключи заново или удалите их в настройках.",
      );
    }
  }
  async import(file: string) {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Системное шифрование недоступно.");
    try {
      const bytes = await readFile(file);
      if (bytes.length > 8192) throw new Error();
      const value = credentialSchema.parse(JSON.parse(bytes.toString("utf8")));
      if (value.rpcEndpoint) validateRpcEndpoint(value.rpcEndpoint);
      const previous = await this.read();
      await writeFile(
        this.file,
        safeStorage.encryptString(JSON.stringify({ ...previous, ...value })),
      );
    } catch {
      throw new Error(
        "Не удалось импортировать API-настройки. Поля JSON: rpcEndpoint, rugcheckKey, xBearerToken, gmgnKey, bubblemapsKey. При повреждении старого хранилища сначала удалите API-настройки. Seed phrase и приватные ключи не принимаются.",
      );
    }
    return this.status();
  }
  async clear() {
    try {
      await unlink(this.file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("Не удалось удалить настройки API.");
    }
    return this.status();
  }
  async status() {
    try {
      const c = await this.read();
      return {
        rpcConfigured: !!c.rpcEndpoint,
        rugcheckConfigured: !!c.rugcheckKey,
        xConfigured: !!c.xBearerToken,
        gmgnConfigured: !!c.gmgnKey,
        bubblemapsConfigured: !!c.bubblemapsKey,
        error: false,
      };
    } catch {
      return {
        rpcConfigured: false,
        rugcheckConfigured: false,
        xConfigured: false,
        gmgnConfigured: false,
        bubblemapsConfigured: false,
        error: true,
      };
    }
  }
}
