FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

FROM base AS deps

COPY package.json yarn.lock .yarnrc.yml prisma.config.ts ./
COPY prisma ./prisma
RUN yarn install --immutable

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY . .

RUN yarn build

FROM base AS runner

ENV NODE_ENV=production

COPY --from=builder /app ./

EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0"]
