const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const relative = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function clock(date: Date) {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** "только что", "5 минут назад", "2 часа назад", "вчера в 14:05", "3 октября в 14:05". */
export function versionAge(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "только что";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (sameDay(date, now)) return relative.format(-Math.floor(elapsed / HOUR), "hour");

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `вчера в ${clock(date)}`;

  const day = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${day} в ${clock(date)}`;
}

/** The exact moment, for a tooltip next to the relative one. */
export function versionMoment(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} КБ`;
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}
