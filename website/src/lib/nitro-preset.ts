/** Nitro emit shape. Vercel will not start `.output/server` from `node-server`. */
export function nitroPreset(
  env: { VERCEL?: string } = process.env,
): "vercel" | "node-server" {
  return env.VERCEL ? "vercel" : "node-server";
}
