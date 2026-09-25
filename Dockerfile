# syntax=docker/dockerfile:1.7
# One image, two processes: `web` (migrate + next start) and `worker` (BullMQ workers).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm prisma generate \
 && DATABASE_URL=postgresql://build:build@localhost:5432/build NEXTAUTH_SECRET=build-time-placeholder-secret pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 HOME=/app
# Claude Code CLI: lets AI_PROVIDER=claude_code use a Claude subscription
# (authenticate with CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`).
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force
RUN groupadd -r app && useradd -r -g app -d /app app && mkdir -p /app/storage/previews /app/.claude && chown -R app:app /app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 3000 3001
CMD ["pnpm", "start"]
