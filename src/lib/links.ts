// A property value that reads like a web address ("https://..." or "host.tld/path").
export function isLinkLike(value: string) {
  return /^(https?:\/\/|[\w-]+(\.[\w-]+)+\/)/i.test(value.trim());
}

export function linkHref(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Project files are shared, so links from them may only open web or mail targets.
export function safeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  const url = /^[a-z][\w+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

export function openExternal(raw: string) {
  const url = safeExternalUrl(raw);
  if (url) window.open(url, "_blank", "noreferrer");
}
