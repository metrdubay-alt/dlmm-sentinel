import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
await mkdir("build/icons", { recursive: true });
const svg = await readFile("assets/icon-source.svg");
const pngs = await Promise.all(
  sizes.map(async (size) => {
    const data = await sharp(svg).resize(size, size).png().toBuffer();
    await writeFile(`build/icons/${size}.png`, data);
    return data;
  }),
);
const icoSizes = sizes.filter((s) => s <= 256),
  header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
for (let i = 0; i < icoSizes.length; i++) {
  const o = 6 + i * 16;
  header[o] = icoSizes[i] === 256 ? 0 : icoSizes[i];
  header[o + 1] = header[o];
  header.writeUInt16LE(1, o + 4);
  header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(pngs[i].length, o + 8);
  header.writeUInt32LE(offset, o + 12);
  offset += pngs[i].length;
}
await writeFile(
  "build/icon.ico",
  Buffer.concat([header, ...pngs.slice(0, icoSizes.length)]),
);
const chunks = (
  [
    ["icp4", 0],
    ["icp5", 2],
    ["icp6", 4],
    ["ic07", 5],
    ["ic08", 6],
    ["ic09", 7],
  ] as const
).map(([tag, i]) => {
  const h = Buffer.alloc(8);
  h.write(tag);
  h.writeUInt32BE(pngs[i].length + 8, 4);
  return Buffer.concat([h, pngs[i]]);
});
const icns = Buffer.alloc(8);
icns.write("icns");
icns.writeUInt32BE(8 + chunks.reduce((a, b) => a + b.length, 0), 4);
await writeFile("build/icon.icns", Buffer.concat([icns, ...chunks]));
console.log("SVG → PNG (8 размеров), ICO, ICNS");
