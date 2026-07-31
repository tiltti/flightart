import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native onnx runtime must stay unbundled
  serverExternalPackages: ["@imgly/background-removal-node", "onnxruntime-node"],
};

export default nextConfig;
