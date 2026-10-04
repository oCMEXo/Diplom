/**
 * The name of a missing third-party module in a program's error output, if there is one.
 * Relative imports ("./logger") are the user's own files, so they are not reported here.
 */
export function missingModule(output: string): string | null {
  const node = output.match(/Cannot find module '([^'./][^']*)'/);
  if (node) return node[1] ?? null;
  const python = output.match(/ModuleNotFoundError: No module named '([^']+)'/);
  return python?.[1] ?? null;
}
