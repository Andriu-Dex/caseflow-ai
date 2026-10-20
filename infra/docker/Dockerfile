# syntax=docker/dockerfile:1
# Images of the self-hosted edition (infra/docker/compose.app.yml). One build
# context (the repository root), one target per service: api, worker, web and
# migrate.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.27.0 --activate
WORKDIR /repo

# ---------------------------------------------------------------- build
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile \
    --filter "@caseflow-ai/api..." --filter "@caseflow-ai/worker..." --filter "@caseflow-ai/web..."

# ---------------------------------------------------------------- migrate
# One-shot job: applies the Prisma migrations before the API starts.
FROM build AS migrate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------- api
FROM build AS api-build
RUN pnpm --filter @caseflow-ai/api run build \
    && pnpm --filter @caseflow-ai/api deploy --prod --legacy --config.node-linker=hoisted /out/api

FROM node:24-bookworm-slim AS api
# The Docker CLI is how the API starts the validation sandbox. It only works
# when compose.app.sandbox.yml gives the container access to the Docker engine.
COPY --from=docker:28-cli /usr/local/bin/docker /usr/local/bin/docker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build /out/api ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------- worker
FROM build AS worker-build
RUN pnpm --filter @caseflow-ai/worker run build \
    && pnpm --filter @caseflow-ai/worker deploy --prod --legacy --config.node-linker=hoisted /out/worker

FROM node:24-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=worker-build /out/worker ./
USER node
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------- web
FROM build AS web-build
# The browser calls the API at this address, so it is fixed when the image is built.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV CASEFLOW_STANDALONE=1
RUN pnpm --filter @caseflow-ai/web run build

FROM node:24-bookworm-slim AS web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=web-build /repo/apps/web/.next/standalone ./
COPY --from=web-build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
