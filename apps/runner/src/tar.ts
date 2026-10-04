export interface TarFile {
  path: string;
  content: string;
}

const BLOCK = 512;

function octal(value: number, length: number) {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

/** Paths that cannot escape the working directory and fit a ustar header (name 100 + prefix 155 bytes). */
export function safeTarPath(path: string): string | null {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return null;
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  return splitPath(path) ? path : null;
}

function splitPath(path: string): { name: string; prefix: string } | null {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  for (let index = path.indexOf("/"); index !== -1; index = path.indexOf("/", index + 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  return null;
}

function header(path: string, size: number): Buffer {
  const parts = splitPath(path)!;
  const block = Buffer.alloc(BLOCK);
  block.write(parts.name, 0, 100, "utf8");
  block.write(octal(0o644, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii");
  block.write(octal(0, 8), 116, "ascii");
  block.write(octal(size, 12), 124, "ascii");
  block.write(octal(0, 12), 136, "ascii");
  block.fill(" ", 148, 156);
  block.write("0", 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  block.write(parts.prefix, 345, 155, "utf8");
  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return block;
}

/**
 * Packs text files into a ustar archive in memory. The sandbox unpacks it from stdin into its own
 * tmpfs, so project files never touch the host's filesystem. Files with unusable paths are skipped.
 */
export function buildTar(files: TarFile[]): Buffer {
  const chunks: Buffer[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!safeTarPath(file.path) || seen.has(file.path)) continue;
    seen.add(file.path);
    const content = Buffer.from(file.content, "utf8");
    chunks.push(header(file.path, content.length), content, Buffer.alloc((BLOCK - (content.length % BLOCK)) % BLOCK));
  }
  chunks.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(chunks);
}
