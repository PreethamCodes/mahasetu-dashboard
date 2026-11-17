FROM node:22-bookworm-slim AS build
WORKDIR /site
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /site
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3004
COPY --from=build --chown=node:node /site/.next/standalone ./
COPY --from=build --chown=node:node /site/.next/static ./.next/static
USER node
CMD ["node","server.js"]
