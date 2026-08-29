FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.base.json tsconfig.server.json tsconfig.web.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle

EXPOSE 3000
USER node
CMD ["node", "dist/server/server/index.js"]
