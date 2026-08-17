import { writeFileSync } from "node:fs";

function icon(size) {
  const r = Math.round(size * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#18181b"/>
  <text x="50%" y="56%" font-family="Georgia, serif" font-size="${size * 0.52}" fill="#b45309" text-anchor="middle" dominant-baseline="middle">V</text>
</svg>`;
}

writeFileSync(new URL("../public/icon-192.svg", import.meta.url), icon(192));
writeFileSync(new URL("../public/icon-512.svg", import.meta.url), icon(512));
writeFileSync(new URL("../public/favicon.svg", import.meta.url), icon(64));

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="100%" stop-color="#292524"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1040" cy="90" r="220" fill="#b45309" opacity="0.12"/>
  <text x="90" y="300" font-family="Georgia, serif" font-size="96" fill="#fafaf9">Veloura</text>
  <text x="92" y="360" font-family="Arial, sans-serif" font-size="34" fill="#d6d3d1">Shopping that gets you</text>
  <text x="92" y="410" font-family="Arial, sans-serif" font-size="22" fill="#a8a29e">Personalized picks · Smart search · ShopAI assistant</text>
</svg>`;
writeFileSync(new URL("../public/og-image.svg", import.meta.url), og);

console.log("Brand assets generated.");
