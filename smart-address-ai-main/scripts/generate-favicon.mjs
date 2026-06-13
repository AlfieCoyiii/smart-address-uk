import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "..", "public");
const markPath = path.join(publicDir, "logo-mark.svg");
const mark = readFileSync(markPath);

// Favicon SVG: same mark on site background for light/dark tab visibility.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="6" fill="#0f172a"/>
  ${mark.toString().replace(/<\/?svg[^>]*>/g, "").trim()}
</svg>`;
writeFileSync(path.join(publicDir, "favicon.svg"), faviconSvg);

const sizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(Buffer.from(faviconSvg), { density: Math.round((size / 32) * 72) })
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);

writeFileSync(path.join(publicDir, "favicon.ico"), await pngToIco(pngBuffers));
writeFileSync(path.join(publicDir, "apple-touch-icon.png"), pngBuffers[pngBuffers.length - 1]);

console.log("Generated favicon.svg, favicon.ico, and apple-touch-icon.png from logo-mark.svg");
