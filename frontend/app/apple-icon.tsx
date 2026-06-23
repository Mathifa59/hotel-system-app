import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          background: "#14110d",
          color: "#c9a35f",
          fontFamily: "serif",
          fontStyle: "italic",
          fontSize: 100,
        }}
      >
        A.
      </div>
    ),
    size
  );
}
