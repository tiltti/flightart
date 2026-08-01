import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native onnx runtime must stay unbundled
  serverExternalPackages: ["@imgly/background-removal-node", "onnxruntime-node"],
  // ...and its linux shared libraries plus the model weights are not reachable
  // by static analysis, so they have to be traced in explicitly
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
      "./node_modules/@imgly/background-removal-node/dist/**",
    ],
  },
  // no dev badge on the wall display
  devIndicators: false,
};

export default nextConfig;
