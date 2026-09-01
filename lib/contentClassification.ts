export type AdultContentStatus = "Yes" | "No" | "Unknown";

const ADULT_PATTERNS = [
  /(^|\W)adult(?:s)?($|\W)/i,
  /(^|\W)xxx($|\W)/i,
  /(^|\W)18\s*(?:\+|plus)($|\W)/i,
  /(^|\W)porn(?:o|ography)?($|\W)/i,
  /(^|\W)erotic(?:a)?($|\W)/i,
  /(^|\W)sex(?:y)?($|\W)/i,
  /(^|\W)nsfw($|\W)/i,
  /(^|\W)mature($|\W)/i,
  /(^|\W)playboy($|\W)/i,
  /(^|\W)penthouse($|\W)/i,
  /(^|\W)brazzers($|\W)/i,
  /(^|\W)red\s*light($|\W)/i,
];

export function isAdultContentName(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, " ").trim();
  return normalized.length > 0 && ADULT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function classifyAdultContent(names: unknown[]): AdultContentStatus {
  const usableNames = names.filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  if (usableNames.length === 0) return "Unknown";
  return usableNames.some(isAdultContentName) ? "Yes" : "No";
}
