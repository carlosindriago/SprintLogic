// Graph theme with a dark space aesthetic.
// Uses a near-black background (#050508) with vibrant,
// self-luminous colors for nodes — the "stars in space" look.
export const graphTheme = {
  background: "#050508",         // Near-black, deeper than before — deep void
  surfaceElevated: "#0f0f14",
  gridDots: "#1a1a2e",
  text: "#e4e4e7",
  border: "#1f1f2e",

  // Vivid node palette (self-luminous feel)
  // Files: colored by extension hash (see extColorHash below)
  // Structural nodes get distinct geometric shapes + colors
  class:     "#f59e0b",   // Amber — warm, central, like a star
  function:  "#34d399",   // Emerald — active, alive
  interface: "#a78bfa",   // Violet — abstract, structural
  unknown:   "#475569",   // Slate — fallback

  // Bloom glow colors (applied as shadowColor in canvas)
  glowClass:     "rgba(245, 158, 11, 0.6)",
  glowFunction:  "rgba(52, 211, 153, 0.5)",
  glowInterface: "rgba(167, 139, 250, 0.55)",
  glowFile:      "rgba(148, 163, 184, 0.3)",

  // Edge colors — very thin, semi-transparent white lines
  edgeDefault:   "rgba(148, 163, 184, 0.18)",
  edgeImport:    "rgba(148, 163, 184, 0.18)",
  edgeCall:      "rgba(52, 211, 153, 0.22)",
  edgeCycle:     "rgba(248, 113, 113, 0.7)",
  edgeGlow:      "rgba(96, 165, 250, 0.85)",

  // States
  focus:       "#ffffff",
  dimOpacity:  0.08,          // Much more aggressive fade — for unfocused elements
};

// Deterministic vibrant color from file extension.
// Uses a hash of the extension string mapped to an HSL hue with fixed high saturation.
// This gives every extension its own consistent, vivid identity.
export function extColorHash(ext: string): string {
  if (!ext) return "#94a3b8";
  let hash = 0;
  for (let i = 0; i < ext.length; i++) {
    hash = (hash * 31 + ext.charCodeAt(i)) >>> 0;
  }
  // Spread across the hue wheel; skip the 200–240° range (too close to UI blues)
  const hue = (hash % 300 + 30) % 360;
  return `hsl(${hue}, 85%, 62%)`;   // High saturation, medium-high lightness = vivid self-luminous look
}

// Bloom glow color derived from a node color (used for shadowColor)
export function bloomGlow(color: string, alpha = 0.55): string {
  // If it's an HSL color, wrap it in rgba-equivalent
  if (color.startsWith("hsl")) {
    return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
  }
  return color;
}

export const graphUI = {
  background: "bg-slate-950/80", // Glass base
  blur: "backdrop-blur-md",
  border: "border border-slate-800/50",
  textPrimary: "text-slate-100",
  textSecondary: "text-slate-400",
  textAccent: "text-cyan-400",
  ring: "ring-1 ring-white/5",
  shadow: "shadow-2xl shadow-black/50"
};
