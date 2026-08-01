import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Background removal is a 290 MB native dependency used for a few seconds of
  // CPU work, so it is deliberately not shipped to the serverless deployment —
  // see CUTOUTS in README. Keeping it external stops it being bundled at all.
  serverExternalPackages: ["@imgly/background-removal-node", "onnxruntime-node"],
  // no dev badge on the wall display
  devIndicators: false,
};

export default nextConfig;
