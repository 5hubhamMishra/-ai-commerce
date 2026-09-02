const FALLBACK_SITE_URL = "https://web-lyart-three-94.vercel.app";

export function getSiteUrl({
  configuredUrl = process.env.NEXT_PUBLIC_SITE_URL,
  vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL,
}: {
  configuredUrl?: string;
  vercelProductionUrl?: string;
} = {}): string {
  const candidate =
    configuredUrl?.trim() ||
    (vercelProductionUrl?.trim()
      ? `https://${vercelProductionUrl.trim()}`
      : FALLBACK_SITE_URL);

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return FALLBACK_SITE_URL;
    }
    return url.origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export const SITE_URL = getSiteUrl();
