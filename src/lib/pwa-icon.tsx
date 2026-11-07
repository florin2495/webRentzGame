import { ImageResponse } from "next/og";

const SPADE =
  "M50 6 C50 6 12 38 12 60 C12 74 23 82 35 82 C41 82 46 79 48 75 C48 85 44 92 35 95 L65 95 C56 92 52 85 52 75 C54 79 59 82 65 82 C77 82 88 74 88 60 C88 38 50 6 50 6 Z";

/** Opaque home-screen icon: purple background, white spade, "R". `content` = share of the canvas the artwork spans. */
export function renderIcon(size: number, content = 0.7) {
  const art = Math.round(size * content);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7e22ce",
        }}
      >
        <div style={{ display: "flex", position: "relative", width: art, height: art }}>
          <svg width={art} height={art} viewBox="0 0 100 100">
            <path d={SPADE} fill="#ffffff" />
          </svg>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: Math.round(art * 0.2),
              width: art,
              height: Math.round(art * 0.5),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#7e22ce",
              fontSize: Math.round(art * 0.46),
              fontWeight: 800,
              fontFamily: "sans-serif",
            }}
          >
            R
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
