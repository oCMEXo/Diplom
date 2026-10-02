import type { RunnableLanguage } from "@collab/shared";

interface LanguageSpec {
  image: string;
  command: string[];
  errorLinePattern: RegExp;
  pick: "first" | "last";
}

export const LANGUAGES: Record<RunnableLanguage, LanguageSpec> = {
  javascript: {
    image: "node:22-alpine",
    command: ["node", "-"],
    errorLinePattern: /\[stdin\]:(\d+)/g,
    pick: "first",
  },
  python: {
    image: "python:3.12-alpine",
    command: ["python", "-"],
    errorLinePattern: /File "<stdin>", line (\d+)/g,
    pick: "last",
  },
};

export const SANDBOX_LIMITS = {
  memory: "128m",
  cpus: "0.5",
  pids: "64",
  tmpfsSize: "16m",
} as const;

export function containerName(runId: string) {
  return `collab-run-${runId}`;
}

export function buildDockerArgs(language: RunnableLanguage, runId: string): string[] {
  const spec = LANGUAGES[language];
  return [
    "run",
    "--rm",
    "-i",
    "--name",
    containerName(runId),
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    `/tmp:rw,size=${SANDBOX_LIMITS.tmpfsSize}`,
    "--user",
    "65534:65534",
    "--memory",
    SANDBOX_LIMITS.memory,
    "--memory-swap",
    SANDBOX_LIMITS.memory,
    "--cpus",
    SANDBOX_LIMITS.cpus,
    "--pids-limit",
    SANDBOX_LIMITS.pids,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--env",
    "HOME=/tmp",
    "--env",
    "PYTHONDONTWRITEBYTECODE=1",
    spec.image,
    ...spec.command,
  ];
}

export function parseErrorLine(language: RunnableLanguage, stderr: string): number | null {
  const spec = LANGUAGES[language];
  const matches = [...stderr.matchAll(spec.errorLinePattern)];
  if (matches.length === 0) return null;
  const match = spec.pick === "first" ? matches[0]! : matches[matches.length - 1]!;
  const line = Number(match[1]);
  return Number.isInteger(line) && line > 0 ? line : null;
}
