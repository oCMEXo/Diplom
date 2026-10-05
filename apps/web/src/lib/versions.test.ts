import { describe, expect, it } from "vitest";
import { formatSize, versionAge } from "./versions";

// Local time, like the browser: 5 October 2026, 15:30.
const now = new Date(2026, 9, 5, 15, 30);
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();

describe("versionAge", () => {
  it("says minutes and hours within today", () => {
    expect(versionAge(ago(20 * 1000), now)).toBe("только что");
    expect(versionAge(ago(60 * 1000), now)).toBe("1 минуту назад");
    expect(versionAge(ago(5 * 60 * 1000), now)).toBe("5 минут назад");
    expect(versionAge(ago(2 * 60 * 60 * 1000 + 10 * 60 * 1000), now)).toBe("2 часа назад");
  });

  it("names yesterday and older days with the time", () => {
    expect(versionAge(at(2026, 9, 4, 23, 50), now)).toBe("вчера в 23:50");
    expect(versionAge(at(2026, 9, 3, 14, 5), now)).toBe("3 октября в 14:05");
    expect(versionAge(at(2025, 11, 31, 9, 0), now)).toBe("31 декабря 2025 г. в 09:00");
  });
});

describe("formatSize", () => {
  it("uses bytes, then kilobytes and megabytes", () => {
    expect(formatSize(340)).toBe("340 Б");
    expect(formatSize(1536)).toBe("1,5 КБ");
    expect(formatSize(3 * 1024 * 1024)).toBe("3 МБ");
  });
});
