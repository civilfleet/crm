FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

FROM base AS deps

COPY package.json yarn.lock .yarnrc.yml prisma.config.ts ./
COPY .yarn ./.yarn
COPY prisma ./prisma
RUN yarn install --immutable

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY . .

RUN yarn build

FROM base AS runner-tools

ENV NODE_ENV=production

COPY --from=builder /app ./

FROM base AS runner-app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./

EXPOSE 3000

CMD ["node", "server.js"]
