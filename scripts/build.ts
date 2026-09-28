import { build } from "esbuild";
import { build as viteBuild } from "vite";
await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/main/main.cjs",
  external: ["electron", "../../generated/client"],
  plugins: [
    {
      name: "prisma-path",
      setup(b) {
        b.onResolve({ filter: /generated\/client(?:\/index\.js)?$/ }, () => ({
          path: "../../src/generated/client/index.js",
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
await viteBuild();
