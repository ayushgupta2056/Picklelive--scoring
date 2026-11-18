import { build } from "esbuild";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server/index.js",
  sourcemap: true,
  external: [...Object.keys(pkg.dependencies ?? {})],
  alias: { "@shared": "./shared" },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
console.log("server built -> dist/server/index.js");
