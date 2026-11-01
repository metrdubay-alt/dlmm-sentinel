import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { version } = JSON.parse(await readFile("package.json", "utf8")) as {
  version: string;
};
const { platform, arch } = process;
assert.equal(platform, process.env.EXPECTED_PLATFORM);
assert.equal(arch, process.env.EXPECTED_ARCH);
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();
const sha = run("git", ["rev-parse", "HEAD"]);
assert.equal(sha, process.env.GITHUB_SHA);
let executable: string;
let installer: string;
let engineArchitecture: string;
let minimumMacOS: string | null = null;
let gatekeeper: string | null = null;
if (platform === "darwin") {
  const label = arch === "arm64" ? "Apple-Silicon" : "Intel";
  installer = `DLMM-Sentinel-${version}-macOS-${label}-${arch}.dmg`;
  await rename(
    path.join("release", `DLMM-Sentinel-${version}-macOS-${arch}.dmg`),
    path.join("release", installer),
  );
  const temporary = await mkdtemp(path.join(tmpdir(), "sentinel-package-"));
  const mount = path.join(temporary, "disk");
  await mkdir(mount);
  run("hdiutil", [
    "attach",
    path.resolve("release", installer),
    "-readonly",
    "-nobrowse",
    "-mountpoint",
    mount,
  ]);
  const application = path.join(temporary, "Applications", "DLMM Sentinel.app");
  try {
    await mkdir(path.dirname(application));
    run("ditto", [path.join(mount, "DLMM Sentinel.app"), application]);
  } finally {
    run("hdiutil", ["detach", mount]);
  }
  executable = path.join(application, "Contents", "MacOS", "DLMM Sentinel");
  const expected = arch === "x64" ? "x86_64" : "arm64";
  assert.equal(run("lipo", ["-archs", executable]), expected);
  const engineDirectory = path.join(
    application,
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "src",
    "generated",
    "client",
  );
  const engines = (await readdir(engineDirectory)).filter((file) =>
    /query_engine.*\.node$/.test(file),
  );
  assert.equal(engines.length, 1, "Exactly one native Prisma engine required");
  engineArchitecture = run("lipo", [
    "-archs",
    path.join(engineDirectory, engines[0]),
  ]);
  assert.equal(engineArchitecture, expected);
  run("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    application,
  ]);
  minimumMacOS = run("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :LSMinimumSystemVersion",
    path.join(application, "Contents", "Info.plist"),
  ]);
  try {
    gatekeeper = run("spctl", [
      "--assess",
      "--type",
      "execute",
      "--verbose=2",
      application,
    ]);
  } catch {
    gatekeeper =
      "Rejected: ad-hoc preview is not Developer ID signed or notarized";
  }
} else {
  assert.equal(platform, "win32");
  assert.equal(arch, "x64");
  installer = `DLMM-Sentinel-${version}-Windows-x64.exe`;
  executable = path.resolve("release", "win-unpacked", "DLMM Sentinel.exe");
  const engine = path.resolve(
    "release",
    "win-unpacked",
    "resources",
    "app.asar.unpacked",
    "src",
    "generated",
    "client",
    "query_engine-windows.dll.node",
  );
  for (const file of [executable, engine]) {
    const bytes = await readFile(file);
    assert.equal(
      bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4),
      0x8664,
      "PE x64 machine",
    );
  }
  engineArchitecture = "x64";
}
await access(executable);
const digest = createHash("sha256")
  .update(await readFile(path.join("release", installer)))
  .digest("hex");
await writeFile(
  `release/SHA256SUMS-${platform}-${arch}.txt`,
  `${digest}  ${installer}\n`,
);
await writeFile(
  `release/package-${platform}-${arch}.json`,
  JSON.stringify(
    {
      sha,
      version,
      platform,
      arch,
      engineArchitecture,
      installer,
      sha256: digest,
      runner: process.env.RUNNER_OS,
      runnerImage: process.env.ImageOS,
      runnerVersion: process.env.ImageVersion,
      minimumMacOS,
      signing:
        platform === "darwin"
          ? "ad-hoc; not Developer ID; not notarized"
          : "unsigned",
      gatekeeper,
      quarantineTested: false,
      testCopy:
        platform === "darwin"
          ? "Mounted DMG copied with ditto to temporary Applications directory"
          : "NSIS build win-unpacked payload",
    },
    null,
    2,
  ),
);
assert(process.env.GITHUB_ENV, "This script prepares a native CI job");
await appendFile(
  process.env.GITHUB_ENV,
  `SENTINEL_PACKAGED_EXE=${executable}\n`,
);
console.log(
  `${installer}: native architecture and package checks passed; E2E runs next.`,
);
