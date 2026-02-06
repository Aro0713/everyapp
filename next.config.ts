import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // 🔴 KRYTYCZNE: wyłącza automatyczne ETagi → koniec 304 Not Modified
  generateEtags: false,
};

export default nextConfig;
