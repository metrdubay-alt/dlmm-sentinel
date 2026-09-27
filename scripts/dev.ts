import { createServer } from "vite";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import electron from "electron";
const server = await createServer();
await server.listen();
await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/main/main.cjs",
  external: ["electron"],
  plugins: [
    {
      name: "prisma-path",
      setup(b) {
        b.onResolve({ filter: /generated\/client$/ }, () => ({
          path: "../../src/generated/client",
          external: true,
        }));
      },
    },
  ],
});
await build({
  entryPoints: ["src/main/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/main/preload.cjs",
  external: ["electron"],
});
const env: NodeJS.ProcessEnv = { ...process.env, SENTINEL_DEV: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron as unknown as string, ["."], {
  stdio: "inherit",
  env,
});
child.on("close", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
process.on("SIGINT", () => child.kill());
