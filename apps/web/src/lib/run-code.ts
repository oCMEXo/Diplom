const CODE_KEY = "collab.runCode";

/** The access code this browser entered; kept so it is asked once, not before every run. */
export const runCode = {
  get(): string | null {
    try {
      return localStorage.getItem(CODE_KEY);
    } catch {
      return null;
    }
  },
  set(code: string) {
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch {
      // Private mode: the code works until the page is reloaded.
      memory = code;
    }
  },
  clear() {
    memory = null;
    try {
      localStorage.removeItem(CODE_KEY);
    } catch {
      // Nothing stored.
    }
  },
};
let memory: string | null = null;

export function currentRunCode() {
  return runCode.get() ?? memory;
}
