FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

# Separate one-shot migration/import image; the API image does not need the CLI.
FROM build AS migration
COPY scripts ./scripts
USER node
CMD ["npm", "run", "db:migrate"]

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=5000
WORKDIR /app
COPY package*.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && npm cache clean --force \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/build ./build
USER node
EXPOSE 5000
CMD ["node", "build/index.js"]
