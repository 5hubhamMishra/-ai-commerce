// Generates realistic seed product & review data for the demo catalog.
import { writeFileSync } from "node:fs";

const categories = [
  {
    name: "Laptops",
    slug: "laptops",
    brands: ["ASUS", "Dell", "Lenovo", "Apple", "HP", "Acer"],
    priceRange: [42000, 185000],
    useCases: ["coding", "machine learning", "gaming", "student", "business", "video editing"],
    specKeys: ["Processor", "RAM", "Storage", "Display", "Graphics", "Battery Life"],
  },
  {
    name: "Headphones",
    slug: "headphones",
    brands: ["Sony", "Bose", "JBL", "Sennheiser", "boAt", "Apple"],
    priceRange: [1200, 32000],
    useCases: ["gym", "commute", "travel", "gaming", "work calls", "studio"],
    specKeys: ["Driver Size", "Battery Life", "Connectivity", "Noise Cancellation", "Weight"],
  },
  {
    name: "Smartphones",
    slug: "smartphones",
    brands: ["Samsung", "Apple", "OnePlus", "Xiaomi", "Google", "Vivo"],
    priceRange: [12000, 145000],
    useCases: ["photography", "gaming", "everyday use", "business"],
    specKeys: ["Display", "Processor", "RAM", "Storage", "Camera", "Battery"],
  },
  {
    name: "Gaming",
    slug: "gaming",
    brands: ["Logitech", "Razer", "SteelSeries", "ASUS ROG", "Corsair", "HyperX"],
    priceRange: [900, 45000],
    useCases: ["competitive gaming", "streaming", "casual gaming"],
    specKeys: ["Type", "Connectivity", "Switch Type", "DPI", "Compatibility"],
  },
  {
    name: "Wearables",
    slug: "wearables",
    brands: ["Apple", "Samsung", "Garmin", "Noise", "Fitbit", "boAt"],
    priceRange: [1800, 52000],
    useCases: ["fitness tracking", "running", "everyday use", "swimming"],
    specKeys: ["Display", "Battery Life", "Water Resistance", "Sensors", "Compatibility"],
  },
  {
    name: "Cameras",
    slug: "cameras",
    brands: ["Canon", "Sony", "Nikon", "Fujifilm", "GoPro", "DJI"],
    priceRange: [8500, 220000],
    useCases: ["travel", "vlogging", "professional photography", "wildlife"],
    specKeys: ["Sensor", "Resolution", "ISO Range", "Video", "Stabilization"],
  },
  {
    name: "Home Audio",
    slug: "home-audio",
    brands: ["Sonos", "JBL", "Bose", "Marshall", "boAt", "Amazon"],
    priceRange: [2500, 65000],
    useCases: ["home theater", "party", "background music", "smart home"],
    specKeys: ["Output Power", "Connectivity", "Battery Life", "Water Resistance"],
  },
  {
    name: "Accessories",
    slug: "accessories",
    brands: ["Anker", "Belkin", "Logitech", "SanDisk", "Spigen", "boAt"],
    priceRange: [400, 12000],
    useCases: ["travel", "office", "gaming", "everyday carry"],
    specKeys: ["Material", "Compatibility", "Capacity", "Ports"],
  },
];

const adjectives = ["Pro", "Air", "Max", "Lite", "Ultra", "Plus", "SE", "Studio", "X", "GT"];
const productNouns = {
  Laptops: ["Book", "Notebook", "Pavilion", "Vivobook", "ThinkPad", "Inspiron", "Zenbook", "Spectre"],
  Headphones: ["WH", "QuietComfort", "Tune", "Momentum", "Rockerz", "AirPods"],
  Smartphones: ["Galaxy", "iPhone", "Nord", "Redmi", "Pixel", "V-series"],
  Gaming: ["Viper", "DeathAdder", "Rival", "ROG Strix", "K70", "Cloud"],
  Wearables: ["Watch", "Fenix", "ColorFit", "Versa", "Band"],
  Cameras: ["EOS", "Alpha", "Z-series", "X-T", "HERO", "Osmo"],
  "Home Audio": ["Beam", "Flip", "SoundLink", "Emberton", "Stone"],
  Accessories: ["PowerCore", "BoostCharge", "MX Keys", "Extreme Pro", "ArcSeries"],
};

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seededRandom(42);
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function round(n, step) { return Math.round(n / step) * step; }

const products = [];
let idCounter = 1;

for (const cat of categories) {
  const count = 14; // ~14 per category => ~112 total
  const nouns = productNouns[cat.name];
  for (let i = 0; i < count; i++) {
    const brand = pick(cat.brands);
    const noun = pick(nouns);
    const adj = rand() > 0.4 ? ` ${pick(adjectives)}` : "";
    const gen = randInt(1, 9);
    const name = `${brand} ${noun}${adj} ${gen}`;
    const [minP, maxP] = cat.priceRange;
    const price = round(randInt(minP, maxP), 100);
    const hasDiscount = rand() > 0.55;
    const compareAtPrice = hasDiscount ? round(price * (1 + randInt(8, 30) / 100), 100) : undefined;
    const rating = Math.round((3.4 + rand() * 1.5) * 10) / 10;
    const reviewCount = randInt(6, 480);
    const specs = {};
    for (const key of cat.specKeys) {
      specs[key] = specValue(cat.name, key, rand, price);
    }
    const tags = [cat.name.toLowerCase(), brand.toLowerCase().replace(/\s+/g, "-")];
    if (hasDiscount) tags.push("deal");
    if (rating >= 4.5) tags.push("top-rated");
    const useCases = shuffle(cat.useCases, rand).slice(0, randInt(1, 3));

    products.push({
      id: `p${idCounter++}`,
      name,
      brand,
      category: cat.name,
      subcategory: cat.slug,
      price,
      compareAtPrice,
      rating,
      reviewCount,
      description: describeProduct(cat.name, name, brand, useCases),
      specs,
      tags,
      images: [`/products/${cat.slug}.svg`],
      stock: randInt(0, 120),
      featured: rand() > 0.82,
      useCases,
    });
  }
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function specValue(category, key, rand, price) {
  const tier = price > 80000 ? "high" : price > 25000 ? "mid" : "entry";
  const table = {
    Processor: { high: "Intel Core i9 / Apple M3 Pro", mid: "Intel Core i5 13th Gen", entry: "Intel Core i3 / Ryzen 5" },
    RAM: { high: "32GB", mid: "16GB", entry: "8GB" },
    Storage: { high: "1TB SSD", mid: "512GB SSD", entry: "256GB SSD" },
    Display: { high: "16-inch 3K OLED, 120Hz", mid: "15.6-inch FHD IPS", entry: "14-inch HD" },
    Graphics: { high: "RTX 4070 8GB", mid: "RTX 3050 4GB", entry: "Integrated Graphics" },
    "Battery Life": { high: "Up to 20 hours", mid: "Up to 12 hours", entry: "Up to 8 hours" },
    "Driver Size": { high: "40mm", mid: "30mm", entry: "20mm" },
    Connectivity: { high: "Bluetooth 5.3, USB-C, Multipoint", mid: "Bluetooth 5.2", entry: "Bluetooth 5.0" },
    "Noise Cancellation": { high: "Adaptive ANC", mid: "Active Noise Cancellation", entry: "Passive Isolation" },
    Weight: { high: "220g", mid: "250g", entry: "180g" },
    Camera: { high: "108MP Triple Camera, OIS", mid: "50MP Dual Camera", entry: "13MP Camera" },
    Battery: { high: "5000mAh, 65W Fast Charging", mid: "5000mAh, 33W Charging", entry: "4500mAh" },
    Type: { high: "Wireless, Ergonomic", mid: "Wired, RGB", entry: "Wired" },
    "Switch Type": { high: "Optical Mechanical", mid: "Mechanical Blue", entry: "Membrane" },
    DPI: { high: "26000 DPI", mid: "16000 DPI", entry: "6400 DPI" },
    Compatibility: { high: "Windows / Mac / Linux", mid: "Windows / Mac", entry: "Windows" },
    "Water Resistance": { high: "5ATM + IP68", mid: "IP68", entry: "IP54" },
    Sensors: { high: "Heart Rate, SpO2, GPS, ECG", mid: "Heart Rate, SpO2, GPS", entry: "Heart Rate" },
    Sensor: { high: "Full-Frame 45MP", mid: "APS-C 26MP", entry: "1-inch 20MP" },
    Resolution: { high: "8K Video / 45MP Photo", mid: "4K Video / 26MP Photo", entry: "1080p / 20MP" },
    "ISO Range": { high: "100-102400", mid: "100-51200", entry: "100-12800" },
    Video: { high: "8K30 / 4K120", mid: "4K60", entry: "1080p60" },
    Stabilization: { high: "5-Axis IBIS", mid: "Optical", entry: "Electronic" },
    "Output Power": { high: "300W RMS", mid: "120W RMS", entry: "30W RMS" },
    Material: { high: "Aluminum + Braided Cable", mid: "ABS Plastic", entry: "Silicone" },
    Capacity: { high: "20000mAh", mid: "10000mAh", entry: "5000mAh" },
    Ports: { high: "3x USB-C, 2x USB-A, HDMI", mid: "2x USB-C, 1x USB-A", entry: "1x USB-C" },
  };
  return table[key]?.[tier] ?? "Standard";
}

function describeProduct(category, name, brand, useCases) {
  const useCaseText = useCases.join(" and ");
  const templates = {
    Laptops: `The ${name} pairs a fast processor with a crisp display, built for ${useCaseText}. Solid battery life and a comfortable keyboard make it easy to work from anywhere.`,
    Headphones: `${name} delivers balanced sound with reliable connectivity, tuned for ${useCaseText}. Lightweight design keeps it comfortable through long listening sessions.`,
    Smartphones: `${name} combines a smooth display with a capable camera system, well suited for ${useCaseText}. All-day battery keeps up with a busy schedule.`,
    Gaming: `Built for ${useCaseText}, the ${name} offers precise response and durable switches that hold up to daily use.`,
    Wearables: `Track ${useCaseText} with the ${name}. Accurate sensors and multi-day battery life keep you moving without constant charging.`,
    Cameras: `The ${name} is built for ${useCaseText}, offering strong low-light performance and reliable autofocus in a compact body.`,
    "Home Audio": `Fill the room with sound suited for ${useCaseText}. The ${name} pairs easily and holds a stable connection across rooms.`,
    Accessories: `A dependable everyday companion for ${useCaseText}, the ${name} is built by ${brand} to handle daily wear without fuss.`,
  };
  return templates[category];
}

const reviewAuthors = ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Karan", "Meera", "Arjun", "Divya", "Rahul", "Ishita"];
const reviewTitlesGood = ["Great value for the price", "Exactly what I needed", "Impressed with the quality", "Works flawlessly", "Would buy again", "Better than expected"];
const reviewTitlesMixed = ["Good but has minor issues", "Decent for the price", "Does the job", "Fair, not exceptional"];
const reviewBodiesGood = [
  "Been using it for a few weeks now and it's held up well. No complaints so far.",
  "Setup was simple and it performs exactly as described. Happy with this purchase.",
  "Quality feels premium for the price point. Delivery was also quick.",
  "Matches the specs listed and works reliably every day.",
];
const reviewBodiesMixed = [
  "It's fine overall, though the battery drains a bit faster than I expected.",
  "Does what it promises but build quality could be better at this price.",
  "Good performance but customer support was slow to respond to my query.",
];

const reviews = [];
let reviewId = 1;
for (const p of products) {
  const n = randInt(2, 6);
  for (let i = 0; i < n; i++) {
    const good = rand() > 0.25;
    reviews.push({
      id: `r${reviewId++}`,
      productId: p.id,
      author: pick(reviewAuthors),
      rating: good ? randInt(4, 5) : randInt(2, 4),
      title: good ? pick(reviewTitlesGood) : pick(reviewTitlesMixed),
      body: good ? pick(reviewBodiesGood) : pick(reviewBodiesMixed),
      date: new Date(2026, randInt(0, 7), randInt(1, 28)).toISOString().slice(0, 10),
      verified: rand() > 0.2,
    });
  }
}

writeFileSync(new URL("../src/lib/data/products.json", import.meta.url), JSON.stringify(products, null, 2));
writeFileSync(new URL("../src/lib/data/reviews.json", import.meta.url), JSON.stringify(reviews, null, 2));
writeFileSync(
  new URL("../src/lib/data/categories.json", import.meta.url),
  JSON.stringify(
    categories.map((c) => ({ name: c.name, slug: c.slug, brands: c.brands })),
    null,
    2
  )
);

console.log(`Generated ${products.length} products and ${reviews.length} reviews.`);
