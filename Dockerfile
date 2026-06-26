# Shared Node image for the DKM services (api-gateway + knowledge-studio). One image, two
# commands — see docker-compose.yml. Tier-A quickstart: no build step, the gateway runs via
# tsx and the studio via the Vite dev server, exactly as `pnpm dev` does locally.
FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable

# Install the pnpm workspace deps once (both services share the result). The host's
# node_modules / .venv / .git are excluded by .dockerignore, so this is a clean install.
COPY . .
RUN pnpm install --frozen-lockfile

# api-gateway :4000 · knowledge-studio :5173
EXPOSE 4000 5173

# Default command (overridden per service in docker-compose.yml).
CMD ["pnpm", "exec", "tsx", "apps/api-gateway/src/server.ts"]
