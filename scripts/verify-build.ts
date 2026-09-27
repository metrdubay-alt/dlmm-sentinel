import { readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";
for (const file of [
  "dist/main/main.cjs",
  "dist/main/preload.cjs",
  "dist/renderer/index.html",
  "src/generated/client/index.js",
  "build/icon.ico",
  "build/icon.icns",
  ...["16", "24", "32", "48", "64", "128", "256", "512"].map(
    (s) => `build/icons/${s}.png`,
  ),
])
  await access(file);
const yml = await readFile("electron-builder.yml", "utf8");
for (const text of [
  "createDesktopShortcut: true",
  "createStartMenuShortcut: true",
  "target: nsis",
  "icon: build/icon.ico",
  "installerIcon: build/icon.ico",
  "runAfterFinish: true",
])
  assert(yml.includes(text), text);
const ico = await readFile("build/icon.ico");
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 7);
const icns = await readFile("build/icon.icns");
assert.equal(icns.subarray(0, 4).toString(), "icns");
assert.equal(icns.readUInt32BE(4), icns.length);
console.log(
  "Проверены renderer/main/preload, Prisma, 10 файлов иконок и параметры NSIS.",
);
