# One image recipe for the three Node services (api, collab, runner).
#   docker build -f infra/docker/Dockerfile --build-arg APP=api    --target app    .
#   docker build -f infra/docker/Dockerfile --build-arg APP=runner --target runner .
FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS app
ARG APP=api
ENV APP=${APP}
COPY . .
RUN pnpm install --frozen-lockfile --filter "@collab/${APP}..." \
    && if [ "$APP" != runner ]; then pnpm --filter @collab/db generate; fi
ENV NODE_ENV=production
# The workspace packages export TypeScript sources, so services run through tsx.
CMD ["sh", "-c", "exec pnpm --filter @collab/$APP exec tsx src/server.ts"]

# The runner talks to the host Docker daemon (mounted socket) to start sandboxes.
FROM app AS runner
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
