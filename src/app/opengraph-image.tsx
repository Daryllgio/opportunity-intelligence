import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "OppScore — Opportunities you're actually competitive for";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
          background: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 700, color: "#111827" }}>
          OppScore
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#111827",
            marginTop: 40,
            lineHeight: 1.15,
            maxWidth: 900,
          }}
        >
          Opportunities you&apos;re actually competitive for
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#6b7280",
            marginTop: 32,
            maxWidth: 880,
            lineHeight: 1.5,
          }}
        >
          Scholarships, fellowships, research programs, grants, and
          competitions — verified sources, real application links, scored
          against your profile.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 12,
            background: "#4b5563",
            display: "flex",
          }}
        />
      </div>
    ),
    size
  );
}
