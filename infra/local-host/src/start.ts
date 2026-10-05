/**
 * Turns this computer into a test host for the platform:
 *   - a separate database (collab_host) in the development Postgres,
 *   - the API and the sync server on local ports,
 *   - the built web app, with /api and /collab on one address,
 *   - optionally a public Cloudflare tunnel in front of it.
 *
 *   pnpm host:test                 # build, start everything, open a public tunnel
 *   pnpm host:test -- --no-tunnel  # same, but only on http://127.0.0.1:8787
 *   pnpm host:test -- --skip-build # reuse the last web build
 *   pnpm host:test -- --no-run     # no code running and no terminal at all
 *
 * Running visitors' code is switched off here on purpose: the public address must not become a way
 * to run other people's programs on this computer.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHostServer } from "./server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const hostDir = path.resolve(here, "..");
const stateDir = path.join(hostDir, ".state");
const logDir = path.join(stateDir, "logs");
const webDir = path.join(stateDir, "web");
const binDir = path.join(hostDir, "bin");

const flags = process.argv.slice(2);
const has = (flag: string) => flags.includes(flag);
const option = (name: string) => flags.find((flag) => flag.startsWith(`${name}=`))?.slice(name.length + 1);

const PORT = Number(option("--port") ?? process.env.HOST_PORT ?? 8787);
const API_PORT = PORT + 1000;
const COLLAB_PORT = PORT + 2000;
const TERMINAL_PORT = PORT + 3000;
const REDIS_PORT = Number(process.env.HOST_REDIS_PORT ?? 6380);
// Database 2: the development runner uses 0 and the end-to-end tests 1, so nobody takes another's jobs.
const REDIS_URL = `redis://localhost:${REDIS_PORT}/2`;
const DB_NAME = "collab_host";
const DB_CONTAINER = process.env.HOST_DB_CONTAINER ?? "collab-dev-postgres-1";
const DB_PORT = Number(process.env.HOST_DB_PORT ?? 5433);
const DATABASE_URL = `postgresql://collab:collab@localhost:${DB_PORT}/${DB_NAME}?schema=public`;

const children: { name: string; child: ChildProcess }[] = [];
let stopping = false;

const say = (message = "") => console.log(message);

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  stop(1);
  process.exit(1);
}

function stop(code: number | null = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  if (code !== null) setTimeout(() => process.exit(code), 200).unref();
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("exit", () => stop(null));

/** Easy to read out and type: no 0/O or 1/I, grouped by four. */
function newRunCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = [...randomBytes(12)].map((byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8].map((start) => chars.slice(start, start + 4).join("")).join("-");
}

/** Kept between restarts, so sign-ins and the access code survive them. */
function secrets() {
  const file = path.join(stateDir, "secrets.json");
  const stored = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as { access?: string; refresh?: string; runCode?: string })
    : {};
  const filled = {
    access: stored.access ?? randomBytes(48).toString("base64url"),
    refresh: stored.refresh ?? randomBytes(48).toString("base64url"),
    runCode: stored.runCode ?? newRunCode(),
  };
  if (JSON.stringify(filled) !== JSON.stringify(stored)) writeFileSync(file, JSON.stringify(filled, null, 2));
  return filled;
}

function dockerWorks() {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

function portOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function runToEnd(command: string, args: string[], env: NodeJS.ProcessEnv, label: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env: { ...process.env, ...env }, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    const log = createWriteStream(path.join(logDir, `${label}.log`));
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} завершился с кодом ${code}; подробности в ${path.join(logDir, `${label}.log`)}`))));
  });
}

function startService(name: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn("pnpm", args, { cwd: repoRoot, env: { ...process.env, ...env }, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const log = createWriteStream(path.join(logDir, `${name}.log`));
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log);
  child.on("exit", (code) => {
    if (!stopping) fail(`${name} неожиданно остановился (код ${code}). Подробности: ${path.join(logDir, `${name}.log`)}`);
  });
  children.push({ name, child });
}

async function waitFor(url: string, label: string, seconds = 60) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(`${label} не запустился за ${seconds} секунд. Смотрите логи в ${logDir}`);
}

async function ensureDatabase() {
  if (!(await portOpen(DB_PORT))) {
    fail(
      `База данных не отвечает на порту ${DB_PORT}. Запустите Docker Desktop и контейнеры разработки:\n` +
        `  docker compose -f infra/docker-compose.dev.yml up -d`,
    );
  }
  const psql = (sql: string) =>
    execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "collab", "-d", "postgres", "-tAc", sql], { encoding: "utf8" }).trim();
  try {
    if (psql(`SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`) !== "1") psql(`CREATE DATABASE ${DB_NAME}`);
  } catch (error) {
    fail(`Не удалось создать базу ${DB_NAME} в контейнере ${DB_CONTAINER}: ${(error as Error).message}`);
  }
}

function cloudflaredAsset() {
  if (process.platform === "win32") return { file: "cloudflared.exe", asset: "cloudflared-windows-amd64.exe" };
  if (process.platform === "linux") {
    return { file: "cloudflared", asset: process.arch === "arm64" ? "cloudflared-linux-arm64" : "cloudflared-linux-amd64" };
  }
  fail("Автоматическая загрузка туннеля поддерживается на Windows и Linux. Запустите с --no-tunnel.");
}

async function ensureCloudflared() {
  const { file, asset } = cloudflaredAsset();
  const target = path.join(binDir, file);
  if (existsSync(target)) return target;

  mkdirSync(binDir, { recursive: true });
  say("• Скачиваем cloudflared (бесплатный туннель Cloudflare, один раз)…");
  const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`);
  if (!response.ok || !response.body) fail(`Не удалось скачать cloudflared (HTTP ${response.status}).`);
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(target));
  if (process.platform !== "win32") chmodSync(target, 0o755);
  try {
    execFileSync(target, ["--version"], { stdio: "ignore" });
  } catch {
    fail("Скачанный cloudflared не запускается. Удалите папку infra/local-host/bin и попробуйте снова.");
  }
  return target;
}

function openTunnel(binary: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    children.push({ name: "cloudflared", child });
    const log = createWriteStream(path.join(logDir, "cloudflared.log"));
    let found = false;
    const onData = (chunk: Buffer) => {
      log.write(chunk);
      const url = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (url && !found) {
        found = true;
        resolve(url);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      if (!found) reject(new Error(`cloudflared завершился с кодом ${code}; см. ${path.join(logDir, "cloudflared.log")}`));
      else if (!stopping) fail("Туннель остановился. Запустите команду заново, чтобы получить новый адрес.");
    });
    setTimeout(() => !found && reject(new Error("Туннель не выдал адрес за 60 секунд.")), 60_000).unref();
  });
}

async function main() {
  mkdirSync(logDir, { recursive: true });
  say("\nТестовый хостинг на этом компьютере\n");

  if (await portOpen(PORT)) fail(`Порт ${PORT} уже занят (возможно, хостинг уже запущен). Укажите другой: --port=8800`);

  say("• Проверяем базу данных…");
  await ensureDatabase();
  const { access, refresh, runCode } = secrets();

  let runReason: string | null = null;
  if (has("--no-run")) runReason = "выключен флагом --no-run";
  else if (!(await portOpen(REDIS_PORT))) runReason = `Redis не отвечает на порту ${REDIS_PORT}`;
  else if (!dockerWorks()) runReason = "Docker не отвечает";
  const runOn = runReason === null;
  if (!runOn) say(`• Запуск кода и терминал выключены: ${runReason}.`);
  const common = { DATABASE_URL, JWT_ACCESS_SECRET: access, NODE_ENV: "production" };

  say("• Применяем миграции…");
  await runToEnd("pnpm", ["--filter", "@collab/db", "migrate:deploy"], { DATABASE_URL }, "migrate").catch((error) => fail(error.message));

  if (has("--skip-build") && existsSync(path.join(webDir, "index.html"))) {
    say("• Используем прошлую сборку сайта (--skip-build).");
  } else {
    say("• Собираем сайт (это занимает около минуты)…");
    await runToEnd(
      "pnpm",
      ["--filter", "@collab/web", "exec", "vite", "build", "--outDir", `"${webDir}"`, "--emptyOutDir"],
      { VITE_API_URL: "/api", VITE_COLLAB_URL: "/collab", VITE_TERMINAL_URL: "/terminal" },
      "web-build",
    ).catch((error) => fail(error.message));
  }

  say("• Запускаем API и сервер совместной работы…");
  startService("api", ["--filter", "@collab/api", "exec", "tsx", "src/server.ts"], {
    ...common,
    JWT_REFRESH_SECRET: refresh,
    PORT: String(API_PORT),
    HOST: "127.0.0.1",
    CORS_ORIGIN: `http://127.0.0.1:${PORT}`,
    RUN_ENABLED: String(runOn),
    RUN_ACCESS_CODE: runCode,
    REDIS_URL,
    TRUST_PROXY: "true",
    RATE_LIMIT_PER_MINUTE: "600",
    RATE_LIMIT_AUTH_PER_MINUTE: "20",
    COLLAB_URL: `http://127.0.0.1:${COLLAB_PORT}`,
  });
  startService("collab", ["--filter", "@collab/collab", "exec", "tsx", "src/server.ts"], {
    ...common,
    PORT: String(COLLAB_PORT),
    HOST: "127.0.0.1",
    REDIS_URL,
  });
  if (runOn) {
    say("• Запускаем песочницу для кода и терминала…");
    startService("runner", ["--filter", "@collab/runner", "exec", "tsx", "src/server.ts"], {
      REDIS_URL,
      TERMINAL_PORT: String(TERMINAL_PORT),
      TERMINAL_HOST: "127.0.0.1",
    });
  }
  await waitFor(`http://127.0.0.1:${API_PORT}/health`, "API");
  await waitFor(`http://127.0.0.1:${COLLAB_PORT}/`, "Сервер совместной работы").catch(() => undefined);

  const server = createHostServer({
    webRoot: webDir,
    apiTarget: `http://127.0.0.1:${API_PORT}`,
    collabTarget: `http://127.0.0.1:${COLLAB_PORT}`,
    terminalTarget: runOn ? `http://127.0.0.1:${TERMINAL_PORT}` : undefined,
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  const local = `http://127.0.0.1:${PORT}`;
  say(`✓ Сайт работает локально: ${local}`);

  let publicUrl: string | null = null;
  if (!has("--no-tunnel")) {
    const binary = await ensureCloudflared();
    say("• Открываем публичный туннель…");
    publicUrl = await openTunnel(binary).catch((error) => fail(error.message));
    writeFileSync(path.join(stateDir, "public-url.txt"), publicUrl);
  }

  say("\n" + "─".repeat(64));
  say(publicUrl ? `  Публичный адрес:  ${publicUrl}` : `  Адрес:  ${local}`);
  if (runOn) {
    say(`  Код доступа к запуску кода и терминалу:  ${runCode}`);
    say("  Без него посетители могут редактировать, но не запускать программы.");
    say("  Код хранится в infra/local-host/.state/secrets.json; удалите строку runCode, чтобы сменить его.");
  } else {
    say("  Запуск кода и терминал на этом сайте выключены.");
  }
  say("  Данные хранятся в базе collab_host, отдельно от вашей разработки.");
  say("  Остановить: Ctrl+C. Пока компьютер спит или окно закрыто, сайт недоступен.");
  say("─".repeat(64) + "\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
