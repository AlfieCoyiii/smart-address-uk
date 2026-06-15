import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "..", "public");
const markPath = path.join(publicDir, "logo-mark.svg");
const mark = readFileSync(markPath);

// Favicon SVG: logo mark on site background (readable in browser tabs).
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="6" fill="#0f172a"/>
  ${mark.toString().replace(/<\/?svg[^>]*>/g, "").trim()}
</svg>`;
writeFileSync(path.join(publicDir, "favicon.svg"), faviconSvg);

const renderPng = (size) =>
  sharp(Buffer.from(faviconSvg), { density: Math.round((size / 32) * 96) })
    .resize(size, size)
    .png();

const icoSizes = [16, 32, 48];
const icoBuffers = await Promise.all(icoSizes.map((size) => renderPng(size).toBuffer()));
writeFileSync(path.join(publicDir, "favicon.ico"), await pngToIco(icoBuffers));

await renderPng(48).toFile(path.join(publicDir, "favicon-48.png"));
await renderPng(192).toFile(path.join(publicDir, "favicon-192.png"));
await renderPng(512).toFile(path.join(publicDir, "apple-touch-icon.png"));

writeFileSync(
  path.join(publicDir, "site.webmanifest"),
  JSON.stringify(
    {
      name: "SmartAddress",
      short_name: "SmartAddress",
      description: "UK address parsing and splitting API",
      start_url: "/",
      display: "standalone",
      background_color: "#0f172a",
      theme_color: "#3b82f6",
      icons: [
        { src: "/favicon-48.png", sizes: "48x48", type: "image/png" },
        { src: "/favicon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/apple-touch-icon.png", sizes: "512x512", type: "image/png" },
      ],
    },
    null,
    2,
  ),
);

console.log("Generated favicon assets and site.webmanifest from logo-mark.svg");
