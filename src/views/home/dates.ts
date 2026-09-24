const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// "today", "yesterday", or a short date, with the year only when it is not this year.
export function dayLabel(date: Date, now = new Date()) {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  const year = date.getFullYear() === now.getFullYear() ? undefined : "numeric";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year });
}
