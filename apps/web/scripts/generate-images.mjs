// Generates simple branded SVG category art used as product imagery in the demo catalog.
import { writeFileSync } from "node:fs";
import categories from "../src/lib/data/categories.json" with { type: "json" };

const palette = {
  laptops: ["#1e293b", "#334155"],
  headphones: ["#7c2d12", "#9a3412"],
  smartphones: ["#0f172a", "#1e3a5f"],
  gaming: ["#3b0764", "#581c87"],
  wearables: ["#14532d", "#166534"],
  cameras: ["#422006", "#713f12"],
  "home-audio": ["#1e1b4b", "#312e81"],
  accessories: ["#164e63", "#155e75"],
};

for (const cat of categories) {
  const [c1, c2] = palette[cat.slug] || ["#1e293b", "#334155"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="480" cy="120" r="180" fill="#ffffff" opacity="0.04"/>
  <circle cx="80" cy="520" r="140" fill="#ffffff" opacity="0.05"/>
  <text x="300" y="315" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#ffffff" fill-opacity="0.9" text-anchor="middle">${cat.name}</text>
</svg>`;
  writeFileSync(new URL(`../public/products/${cat.slug}.svg`, import.meta.url), svg);
}
console.log("Generated category art.");
