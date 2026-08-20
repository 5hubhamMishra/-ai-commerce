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
  {
    name: "Footwear",
    slug: "footwear",
    brands: ["Nike", "Adidas", "Puma", "Reebok", "Woodland", "Bata"],
    priceRange: [800, 15000],
    useCases: ["running", "gym workouts", "casual wear", "hiking", "formal occasions", "everyday walking"],
    specKeys: ["Upper Material", "Sole Type", "Closure", "Available Sizes", "Weight"],
  },
  {
    name: "Shirts",
    slug: "shirts",
    brands: ["Levi's", "H&M", "Zara", "Allen Solly", "Van Heusen", "Peter England"],
    priceRange: [500, 4500],
    useCases: ["office wear", "casual outings", "formal events", "everyday wear"],
    specKeys: ["Fabric", "Fit", "Sleeve Length", "Pattern", "Available Sizes"],
  },
  {
    name: "Pants",
    slug: "pants",
    brands: ["Levi's", "Wrangler", "Lee", "H&M", "Zara", "Allen Solly"],
    priceRange: [700, 5000],
    useCases: ["office wear", "casual outings", "everyday wear", "travel"],
    specKeys: ["Fabric", "Fit", "Waist Type", "Available Sizes", "Wash"],
  },
  {
    name: "Groceries",
    slug: "groceries",
    brands: ["Tata", "Amul", "Nestle", "ITC", "Britannia", "Fortune"],
    priceRange: [40, 1200],
    useCases: ["daily cooking", "breakfast", "snacking", "healthy eating", "baking"],
    specKeys: ["Net Weight", "Shelf Life", "Dietary Info", "Storage Instructions"],
  },
];

const adjectives = ["Pro", "Air", "Max", "Lite", "Ultra", "Plus", "SE", "Studio", "X", "GT"];
const groceryAdjectives = ["Premium", "Classic", "Organic", "Value Pack", "Gold", "Everyday"];
const productNouns = {
  Laptops: ["Book", "Notebook", "Pavilion", "Vivobook", "ThinkPad", "Inspiron", "Zenbook", "Spectre"],
  Headphones: ["WH", "QuietComfort", "Tune", "Momentum", "Rockerz", "AirPods"],
  Smartphones: ["Galaxy", "iPhone", "Nord", "Redmi", "Pixel", "V-series"],
  Gaming: ["Viper", "DeathAdder", "Rival", "ROG Strix", "K70", "Cloud"],
  Wearables: ["Watch", "Fenix", "ColorFit", "Versa", "Band"],
  Cameras: ["EOS", "Alpha", "Z-series", "X-T", "HERO", "Osmo"],
  "Home Audio": ["Beam", "Flip", "SoundLink", "Emberton", "Stone"],
  Accessories: ["PowerCore", "BoostCharge", "MX Keys", "Extreme Pro", "ArcSeries"],
  Footwear: ["Air Max", "Ultraboost", "RS-X", "Classic Runner", "Trail Runner", "Court Vision"],
  Shirts: ["Oxford Shirt", "Formal Shirt", "Casual Shirt", "Linen Shirt", "Checked Shirt", "Slim Fit Shirt"],
  Pants: ["Slim Fit Chinos", "Straight Jeans", "Formal Trousers", "Cargo Pants", "Jogger Pants"],
  Groceries: ["Basmati Rice", "Cooking Oil", "Whole Wheat Atta", "Toor Dal", "Green Tea", "Peanut Butter", "Breakfast Cereal", "Masala Mix"],
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
    const isGrocery = cat.name === "Groceries";
    const adjList = isGrocery ? groceryAdjectives : adjectives;
    const adj = rand() > 0.4 ? ` ${pick(adjList)}` : "";
    const gen = randInt(1, 9);
    const name = isGrocery ? `${brand} ${noun}${adj}` : `${brand} ${noun}${adj} ${gen}`;
    const [minP, maxP] = cat.priceRange;
    const price = round(randInt(minP, maxP), 100);
    const hasDiscount = rand() > 0.55;
    const compareAtPrice = hasDiscount ? round(price * (1 + randInt(8, 30) / 100), 100) : undefined;
    const rating = Math.round((3.4 + rand() * 1.5) * 10) / 10;
    const reviewCount = randInt(6, 480);
    const specs = {};
    for (const key of cat.specKeys) {
      specs[key] = specValue(cat.name, key, rand, price, cat.priceRange);
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

function specValue(category, key, rand, price, priceRange) {
  // Tier relative to the category's own price range, not a fixed global threshold — a
  // fixed $80k/$25k split put every Footwear/Shirts/Pants/Groceries product (all well
  // under $25k) into "entry" every time, with zero spec variety within those categories.
  const [minP, maxP] = priceRange;
  const span = maxP - minP || 1;
  const frac = (price - minP) / span;
  const tier = frac > 0.66 ? "high" : frac > 0.33 ? "mid" : "entry";

  // "Available Sizes" means something different per category (shoe sizes vs. clothing
  // letter sizes vs. waist inches) — a single shared table entry gave shirts and pants
  // the same shoe-size-shaped values as Footwear. Branch by category before falling
  // through to the shared table below.
  if (key === "Available Sizes") {
    if (category === "Shirts") {
      return { high: "S - XXL", mid: "S - XL", entry: "M - L" }[tier];
    }
    if (category === "Pants") {
      return { high: "28-40 inch waist", mid: "28-36 inch waist", entry: "30-34 inch waist" }[tier];
    }
  }

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
    "Upper Material": { high: "Genuine Leather", mid: "Synthetic Leather", entry: "Canvas" },
    "Sole Type": { high: "EVA Cushioned + Rubber Outsole", mid: "Rubber Outsole", entry: "PU Sole" },
    Closure: { high: "Lace-Up with Ortholite Insole", mid: "Lace-Up", entry: "Slip-On" },
    "Available Sizes": { high: "UK 6-11 (Half Sizes Available)", mid: "UK 6-10", entry: "UK 7-9" },
    Fabric: { high: "100% Cotton", mid: "Cotton-Polyester Blend", entry: "Polyester" },
    Fit: { high: "Slim Fit", mid: "Regular Fit", entry: "Relaxed Fit" },
    "Sleeve Length": { high: "Full Sleeve", mid: "Half Sleeve", entry: "Full Sleeve" },
    Pattern: { high: "Checked", mid: "Striped", entry: "Solid" },
    "Waist Type": { high: "Mid-Rise", mid: "Regular Waist", entry: "Elastic Waist" },
    Wash: { high: "Stone Wash", mid: "Dark Wash", entry: "Light Wash" },
    "Net Weight": { high: "5kg Pack", mid: "1kg Pack", entry: "500g Pack" },
    "Shelf Life": { high: "12 months", mid: "6 months", entry: "3 months" },
    "Dietary Info": { high: "Organic, Gluten-Free", mid: "Vegetarian", entry: "No Added Preservatives" },
    "Storage Instructions": { high: "Store in a cool, dry place", mid: "Store in an airtight container", entry: "Refrigerate after opening" },
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
    Footwear: `Built for ${useCaseText}, the ${name} offers reliable grip and all-day comfort with a durable construction from ${brand}.`,
    Shirts: `The ${name} is tailored for ${useCaseText}, offering a comfortable fit and breathable fabric that holds up to regular wear.`,
    Pants: `Designed for ${useCaseText}, the ${name} combines a comfortable fit with durable fabric that moves with you.`,
    Groceries: `${name} is a pantry staple for ${useCaseText}, sourced and packaged by ${brand} to stay fresh from shelf to table.`,
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
