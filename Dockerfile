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
RUN --mount=type=cache,target=/root/.yarn/berry/cache,sharing=locked \
  yarn install --immutable

FROM deps AS test

COPY . .

RUN yarn ci:verify

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY . .

ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}

RUN --mount=type=cache,target=/app/.next/cache,sharing=locked \
  yarn build

FROM deps AS runner-tools

ENV NODE_ENV=production

COPY . .

FROM base AS runner-app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./

EXPOSE 3000

CMD ["node", "server.js"]

# The VM targets remain available while the Kubernetes migration is rehearsed.
FROM runner-app AS runner-kubernetes-app
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next
ENV HOSTNAME=::
USER node

FROM runner-tools AS runner-kubernetes-tools
USER node

FROM chrislusf/seaweedfs:latest AS runner-seaweedfs

COPY config/seaweedfs-s3.json /etc/seaweedfs/s3.json

# Public intake contains no CRM routes, database client, or production secrets.
FROM deps AS builder-public-api
COPY scripts/public-api.ts ./scripts/public-api.ts
COPY src/lib/public-events/registration.ts ./src/lib/public-events/registration.ts
COPY src/lib/public-forms/submission.ts ./src/lib/public-forms/submission.ts
COPY src/lib/public-forms/counts.ts ./src/lib/public-forms/counts.ts
RUN yarn api:build

FROM base AS runner-public-api
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder-public-api /app/public-api/dist/server.cjs ./server.cjs
USER node
EXPOSE 8080
CMD ["node", "server.cjs"]
