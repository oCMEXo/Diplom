export interface ChartSeries {
  name: string;
  color: string;
  dashed?: boolean;
  points: { x: string; y: number }[];
}

export interface ChartOptions {
  title: string;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
  /** Plot the y axis on a log scale (for values spanning orders of magnitude). */
  logY?: boolean;
}

const WIDTH = 640;
const HEIGHT = 380;
const MARGIN = { top: 48, right: 24, bottom: 56, left: 72 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / exponent;
  const rounded = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return rounded * exponent;
}

function formatTick(value: number): string {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${+(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `${+(value / 1000).toFixed(1)}k`;
  if (value >= 10) return String(Math.round(value));
  return String(+value.toFixed(2));
}

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function lineChart(options: ChartOptions): string {
  const categories = [...new Set(options.series.flatMap((s) => s.points.map((p) => p.x)))];
  const allY = options.series.flatMap((s) => s.points.map((p) => p.y)).filter((y) => y > 0);
  const maxY = niceMax(Math.max(...allY, 1));
  const minY = options.logY ? Math.pow(10, Math.floor(Math.log10(Math.min(...allY, maxY)))) : 0;

  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xAt = (index: number) =>
    MARGIN.left + (categories.length === 1 ? plotW / 2 : (index / (categories.length - 1)) * plotW);
  const yAt = (value: number) => {
    const clamped = Math.max(value, minY);
    const ratio = options.logY
      ? (Math.log10(clamped) - Math.log10(minY)) / (Math.log10(maxY) - Math.log10(minY) || 1)
      : clamped / maxY;
    return MARGIN.top + plotH - ratio * plotH;
  };

  const ticks: number[] = [];
  if (options.logY) {
    for (let v = minY; v <= maxY * 1.0001; v *= 10) ticks.push(v);
  } else {
    for (let i = 0; i <= 5; i += 1) ticks.push((maxY / 5) * i);
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="system-ui, sans-serif" font-size="12">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>`,
    `<text x="${WIDTH / 2}" y="26" text-anchor="middle" font-size="15" font-weight="600" fill="#0f172a">${escapeXml(options.title)}</text>`,
  );

  for (const tick of ticks) {
    const y = yAt(tick);
    parts.push(
      `<line x1="${MARGIN.left}" x2="${WIDTH - MARGIN.right}" y1="${y}" y2="${y}" stroke="#e2e8f0"/>`,
      `<text x="${MARGIN.left - 8}" y="${y + 4}" text-anchor="end" fill="#475569">${formatTick(tick)}</text>`,
    );
  }
  categories.forEach((category, index) => {
    parts.push(
      `<text x="${xAt(index)}" y="${HEIGHT - MARGIN.bottom + 20}" text-anchor="middle" fill="#475569">${escapeXml(category)}</text>`,
    );
  });
  parts.push(
    `<line x1="${MARGIN.left}" x2="${MARGIN.left}" y1="${MARGIN.top}" y2="${MARGIN.top + plotH}" stroke="#94a3b8"/>`,
    `<line x1="${MARGIN.left}" x2="${WIDTH - MARGIN.right}" y1="${MARGIN.top + plotH}" y2="${MARGIN.top + plotH}" stroke="#94a3b8"/>`,
    `<text x="${MARGIN.left + plotW / 2}" y="${HEIGHT - 14}" text-anchor="middle" fill="#334155">${escapeXml(options.xLabel)}</text>`,
    `<text transform="translate(16 ${MARGIN.top + plotH / 2}) rotate(-90)" text-anchor="middle" fill="#334155">${escapeXml(options.yLabel)}</text>`,
  );

  for (const series of options.series) {
    const coords = series.points.map((point) => ({
      x: xAt(categories.indexOf(point.x)),
      y: yAt(point.y),
    }));
    const dash = series.dashed ? ' stroke-dasharray="6 4"' : "";
    parts.push(
      `<polyline fill="none" stroke="${series.color}" stroke-width="2.5"${dash} points="${coords
        .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(" ")}"/>`,
    );
    for (const c of coords) {
      parts.push(`<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${series.color}"/>`);
    }
  }

  options.series.forEach((series, index) => {
    const lx = MARGIN.left + 12 + index * 150;
    const dash = series.dashed ? ' stroke-dasharray="6 4"' : "";
    parts.push(
      `<line x1="${lx}" x2="${lx + 22}" y1="${MARGIN.top - 10}" y2="${MARGIN.top - 10}" stroke="${series.color}" stroke-width="2.5"${dash}/>`,
      `<text x="${lx + 28}" y="${MARGIN.top - 6}" fill="#334155">${escapeXml(series.name)}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("\n");
}
