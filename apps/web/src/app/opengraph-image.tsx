import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Next falls back to this for Twitter/X cards too when no dedicated
// twitter-image exists — one real, dynamically-rendered PNG instead of the
// static public/og-image.svg, which most social crawlers (Twitter/X,
// Facebook, LinkedIn) render unreliably or not at all for OG previews.
// Mirrors that SVG's own design (dark ink gradient, amber accent, wordmark)
// so both stay visually consistent even though this is the one actually
// served to crawlers.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #18181b 0%, #292524 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -130,
            right: -60,
            width: 440,
            height: 440,
            borderRadius: "50%",
            background: "#b45309",
            opacity: 0.18,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 700,
            color: "#fafaf9",
            letterSpacing: "-0.02em",
          }}
        >
          Veloura
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#d6d3d1", marginTop: 18 }}>
          Shopping that gets you
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#a8a29e", marginTop: 10 }}>
          Personalized picks · Smart search · ShopAI assistant
        </div>
      </div>
    ),
    { ...size },
  );
}
