const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "12 days ago", "Mar 2024". */
export function formatLastPlayed(unixSeconds: number, now = Date.now() / 1000): string {
  if (!unixSeconds) return "Never played";
  const delta = Math.max(0, now - unixSeconds);
  if (delta < MINUTE) return "Played just now";
  if (delta < HOUR) return plural(Math.floor(delta / MINUTE), "minute");
  if (delta < DAY) return plural(Math.floor(delta / HOUR), "hour");
  if (delta < 2 * DAY) return "Played yesterday";
  if (delta < 60 * DAY) return plural(Math.floor(delta / DAY), "day");
  const date = new Date(unixSeconds * 1000);
  return `Played ${date.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
}

function plural(n: number, unit: string): string {
  return `Played ${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** 15120 -> "252 hours", 516 -> "8.6 hours", 42 -> "42 minutes". */
export function formatPlaytime(minutes: number | undefined): string | undefined {
  if (!minutes) return undefined;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
}

export function formatBytes(bytes: number | undefined): string | undefined {
  if (!bytes) return undefined;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
