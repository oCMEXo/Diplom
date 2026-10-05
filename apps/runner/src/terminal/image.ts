import { Readable } from "node:stream";
import type Docker from "dockerode";
import { buildTar } from "../tar.js";

/** Bump the tag whenever the Dockerfile below changes, so runners build the new image. */
export const TERMINAL_IMAGE = "collab-terminal:1";

/** Node and Python in one image, with bash, so `node main.js` and `python app.py` both work. */
const DOCKERFILE = `FROM node:22-alpine
RUN apk add --no-cache bash python3 coreutils ncurses less \\
 && ln -sf /usr/bin/python3 /usr/local/bin/python
COPY bashrc /etc/collab.bashrc
ENV TERM=xterm-256color LANG=C.UTF-8 HOME=/project HISTFILE=/tmp/.bash_history \\
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 NODE_DISABLE_COLORS=
`;

// A prompt in the spirit of Git Bash: who, where, then "$" on its own line.
const BASHRC = String.raw`PS1='\[\e[32m\]$COLLAB_USER@collab \[\e[35m\]sandbox \[\e[33m\]\w\[\e[0m\]\n\$ '
alias ls='ls --color=auto'
alias ll='ls -la --color=auto'
alias grep='grep --color=auto'
`;

let ready: Promise<void> | null = null;

/** Builds the terminal image once if this Docker host does not have it yet (needs the internet once). */
export function ensureTerminalImage(docker: Docker): Promise<void> {
  ready ??= (async () => {
    try {
      await docker.getImage(TERMINAL_IMAGE).inspect();
      return;
    } catch {
      // Not built yet.
    }
    const context = buildTar([
      { path: "Dockerfile", content: DOCKERFILE },
      { path: "bashrc", content: BASHRC },
    ]);
    const stream = await docker.buildImage(Readable.from(context), { t: TERMINAL_IMAGE });
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (error, output: { error?: string }[]) => {
        const failed = error ?? output.find((step) => step.error)?.error;
        if (failed) reject(failed instanceof Error ? failed : new Error(String(failed)));
        else resolve();
      });
    });
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
