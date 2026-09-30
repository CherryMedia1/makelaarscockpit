# Migratie-job: docker build -f db/Dockerfile db
FROM node:22-alpine
WORKDIR /db
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY migrate.mjs ./
COPY migrations ./migrations
RUN addgroup -S app && adduser -S app -G app
USER app
CMD ["node", "migrate.mjs", "--controle-rls"]
