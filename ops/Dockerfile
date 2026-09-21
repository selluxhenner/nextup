# The NextUp app image. Multi-stage: install -> build -> a runtime carrying no toolchain.
#
# node:22 because vitest 5 wants >=22.12 and next 16 wants >=20.9. bookworm-slim rather than
# alpine: glibc, and the image is still small. Prisma 7 talks to Postgres through the pure-JS pg
# driver adapter - there is no native query engine any more - so no OpenSSL setup is needed.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Schema and config first: postinstall runs `prisma generate`, which needs them. It does NOT need
# a database, which is what keeps this layer cacheable and the CI build honest.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci --no-audit --no-fund

# ── build ────────────────────────────────────────────────────────────────────
# A named stage because the `migrate` service reuses it: it is the only image that carries the
# prisma CLI and the migrations, which the standalone runtime deliberately does not.
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No DATABASE_URL here, on purpose: the build must not need one. Same condition as CI.
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# standalone brings its own traced node_modules and server.js. `public` and `.next/static` are
# NOT part of it - server.js only serves them once they are placed here.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
# server.js reads PORT and HOSTNAME from the environment (Next docs, output: "standalone").
CMD ["node", "server.js"]
