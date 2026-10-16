# Multi-stage build for the multi-tenant CRM service.
# Node 22 (Active LTS). Node 20 reached end of life in April 2026.
FROM public.ecr.aws/docker/library/node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci installs exactly what the lockfile pins, so the image matches what was
# reviewed and tested. npm install may silently resolve newer versions.
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:22-slim AS runtime
ENV NODE_ENV=production
# The app binds 127.0.0.1 by default so local `npm run dev` is not exposed on
# the developer's network. In the container the listener must accept the
# container network for the ECS Express Gateway to route to it, so opt in here.
# The container publishes no host port; the gateway is the boundary.
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
