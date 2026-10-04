import type { RunnableLanguage } from "@collab/shared";

interface LanguageSpec {
  image: string;
  /** Interpreter that runs the entry file. */
  interpreter: string;
  defaultEntry: string;
  /** Matches `<file>:<line>` in the error output; `%FILE%` is replaced by the entry file's path. */
  errorLinePattern: (file: string) => RegExp;
  pick: "first" | "last";
}

/** Where the project is unpacked inside the container (a tmpfs). */
export const WORKDIR = "/tmp/p";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const LANGUAGES: Record<RunnableLanguage, LanguageSpec> = {
  javascript: {
    image: "node:22-alpine",
    interpreter: "node",
    defaultEntry: "main.js",
    errorLinePattern: (file) => new RegExp(`${escapeRegExp(WORKDIR)}/(?:\\./)?${escapeRegExp(file)}:(\\d+)`, "g"),
    pick: "first",
  },
  python: {
    image: "python:3.12-alpine",
    interpreter: "python",
    defaultEntry: "main.py",
    errorLinePattern: (file) =>
      new RegExp(`File "${escapeRegExp(WORKDIR)}/(?:\\./)?${escapeRegExp(file)}", line (\\d+)`, "g"),
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

export function entryFile(language: RunnableLanguage, entry?: string) {
  return entry || LANGUAGES[language].defaultEntry;
}

export function buildDockerArgs(language: RunnableLanguage, runId: string, entry?: string): string[] {
  const spec = LANGUAGES[language];
  // The entry path travels in an environment variable and is quoted in the script, so file names
  // cannot inject shell code; the "./" keeps a name starting with "-" from being read as an option.
  const script = `mkdir -p ${WORKDIR} && tar -xf - -C ${WORKDIR} && cd ${WORKDIR} && exec ${spec.interpreter} "./$ENTRY"`;
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
    "--env",
    `ENTRY=${entryFile(language, entry)}`,
    spec.image,
    "sh",
    "-c",
    script,
  ];
}

export function parseErrorLine(language: RunnableLanguage, stderr: string, entry?: string): number | null {
  const spec = LANGUAGES[language];
  const matches = [...stderr.matchAll(spec.errorLinePattern(entryFile(language, entry)))];
  if (matches.length === 0) return null;
  const match = spec.pick === "first" ? matches[0]! : matches[matches.length - 1]!;
  const line = Number(match[1]);
  return Number.isInteger(line) && line > 0 ? line : null;
}
