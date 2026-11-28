import { compression, defineAlgorithm } from "vite-plugin-compression2";
import { constants as zlib } from "node:zlib";
import { publishDir } from "./publishBuild.ts";

// Each file a .br (Brotli at 11) and a .gz (gzip at 9) beside it, made
// once here, which the gateway sends to a browser that asks for them
// (WebMvcConfig's EncodedResourceResolver): Brotli at 11 is too slow to
// make per request, and made here it is 19% under gzip for the engine's
// WebAssembly (397,838 bytes to 492,654, 2026-11-14), which iPhone Safari
// takes (Accept-Encoding: gzip, deflate, br). The service worker's
// globPatterns name no .br or .gz, so it keeps only the files themselves.
// CI's build check serves nothing, so asks for none (WINGTIP_PRECOMPRESS=0:
// they took the build from about 30 s to 89, run 43735121847). Nor the
// live stack's watch (publishDir set): the plugin's closeBundle stats
// every public file in STAGING while publish renames them away, its
// ENOENTs stay in the plugin's one task queue, never cleared, and every
// later rebuild then failed with them ("Compression failed in bundle
// compression with 98 error(s) ... stat '/w/.dist-next/splash/..."). The
// gateway's server.compression gzips the same types on the fly there.
export function compressed(): ReturnType<typeof compression> | false {
  if (process.env.WINGTIP_PRECOMPRESS === "0" || publishDir) return false;
  return compression({
    include: /\.(js|mjs|css|html|svg|json|webmanifest|wasm)$/,
    threshold: 1024,
    algorithms: [defineAlgorithm("brotliCompress", { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }), defineAlgorithm("gzip", { level: 9 })],
  });
}
