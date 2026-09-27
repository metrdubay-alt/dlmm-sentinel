import { PrismaClient } from "../../generated/client/index.js";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
export async function openDatabase(
  directory: string,
  migrationsDirectory: string,
) {
  await mkdir(directory, { recursive: true });
  const database = new PrismaClient({
    datasources: {
      db: {
        url: `file:${path.join(directory, "sentinel.db").replaceAll("\\", "/")}`,
      },
    },
  });
  await database.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "_SentinelMigration" ("id" TEXT PRIMARY KEY NOT NULL)',
  );
  const applied = await database.$queryRawUnsafe<{ id: string }[]>(
    'SELECT id FROM "_SentinelMigration"',
  );
  for (const name of (await readdir(migrationsDirectory)).sort()) {
    if (name.includes(".") || applied.some((x) => x.id === name)) continue;
    const sql = await readFile(
      path.join(migrationsDirectory, name, "migration.sql"),
      "utf8",
    );
    await database.$transaction(async (tx) => {
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(
        'INSERT INTO "_SentinelMigration" (id) VALUES (?)',
        name,
      );
    });
  }
  return database;
}
export type Database = Awaited<ReturnType<typeof openDatabase>>;
