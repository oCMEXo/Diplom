/** One palette for everything that identifies a person: avatars, cursors, project tiles. */
export const USER_COLORS = ["#f87171", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee", "#fb923c"];

function hash(value: string) {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) result = (result * 31 + value.charCodeAt(i)) >>> 0;
  return result;
}

export function colorForUser(id: string) {
  return USER_COLORS[hash(id) % USER_COLORS.length]!;
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [...words[0]!].slice(0, 2) : [[...words[0]!][0], [...words[1]!][0]];
  return letters.join("").toUpperCase();
}

/** A pleasant two-stop gradient derived from an id, for project tiles. */
export function gradientFor(id: string) {
  const a = USER_COLORS[hash(id) % USER_COLORS.length]!;
  const b = USER_COLORS[(hash(id) >>> 3) % USER_COLORS.length]!;
  return `linear-gradient(135deg, ${a}, ${b === a ? "#7c6cff" : b})`;
}
