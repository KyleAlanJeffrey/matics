const KNOWN_LABELS: Record<string, string> = {
  ip: "IP address",
  canAddress: "CAN address",
};

const ACRONYMS = new Set(["can", "ip", "io", "gmsl", "gps", "id", "url"]);

// Property keys are typed freely ("canAddress", "CAN bitrate", "on hand"); show them as words.
export function propLabel(key: string): string {
  if (Object.hasOwn(KNOWN_LABELS, key)) return KNOWN_LABELS[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()));
  if (words.length === 0) return key;
  const [first, ...rest] = words;
  return [first === first.toUpperCase() ? first : first[0].toUpperCase() + first.slice(1), ...rest].join(" ");
}

// Addresses, hex IDs and ports read better in a fixed-width face.
export function isCodeLike(value: string): boolean {
  return /^(0x[0-9a-f]+|\d{1,3}(\.\d{1,3}){3}(:\d+)?|:\d+)$/i.test(value.trim());
}
