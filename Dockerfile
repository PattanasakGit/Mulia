# syntax=docker/dockerfile:1
# MULIA self-hosted image: Next.js standalone, multi-stage, non-root.
# The host is small (~2GB RAM available): the build caps the Node heap. Build on a quiet host,
# or elsewhere, and move the image.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies are needed to build (Tailwind, TypeScript); they are not copied to the runtime image.
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=1024
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=192
RUN addgroup -S mulia && adduser -S mulia -G mulia
COPY --from=build --chown=mulia:mulia /app/.next/standalone ./
COPY --from=build --chown=mulia:mulia /app/.next/static ./.next/static
COPY --from=build --chown=mulia:mulia /app/public ./public
COPY --chmod=0755 deploy/entrypoint.sh /usr/local/bin/mulia-entrypoint
USER mulia
EXPOSE 3000
# The landing page does not touch the database: this is liveness only, not DB readiness.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["mulia-entrypoint"]
CMD ["node", "server.js"]
