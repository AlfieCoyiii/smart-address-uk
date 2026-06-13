import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "..", "public");
const svgPath = path.join(publicDir, "favicon.svg");
const svg = readFileSync(svgPath);

const sizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: Math.round((size / 32) * 72) })
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);

writeFileSync(path.join(publicDir, "favicon.ico"), await pngToIco(pngBuffers));
writeFileSync(path.join(publicDir, "apple-touch-icon.png"), pngBuffers[pngBuffers.length - 1]);

console.log("Generated favicon.ico and apple-touch-icon.png");
