import { ImageResponse } from "next/og";

export const contentType = "image/png";

export function GET() {
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
          fontSize: 290,
        }}
      >
        A.
      </div>
    ),
    { width: 512, height: 512 }
  );
}
