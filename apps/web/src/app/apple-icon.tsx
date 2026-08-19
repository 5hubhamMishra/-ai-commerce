import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same "V" logo mark treatment as the login/register pages' logo mark
// (ink rounded-square, white letterform), rendered as a real PNG — iOS
// "Add to Home Screen" needs a raster icon, the public/icon-*.svg files
// aren't a substitute for it.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0a09",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Georgia, serif",
            fontSize: 96,
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          V
        </div>
      </div>
    ),
    { ...size },
  );
}
