/** Semantic zoom level-of-detail derived from React Flow viewport zoom. */

export type LodLevel = "macro" | "mid" | "micro";

/** Macro ≈ 10–35%; mid ≈ 35–100%; micro ≥ 100%. */
export function lodFromZoom(zoom: number): LodLevel {
  if (zoom < 0.35) return "macro";
  if (zoom < 1) return "mid";
  return "micro";
}

export function lodLabel(level: LodLevel): string {
  switch (level) {
    case "macro":
      return "Macro view";
    case "mid":
      return "Mid view";
    case "micro":
      return "Micro view";
  }
}
