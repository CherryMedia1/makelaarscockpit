# Jobs (sync, import): docker build -f apps/jobs/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
RUN npm run build -w @makelaarscockpit/jobs

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/jobs/dist/jobs.cjs ./jobs.cjs
RUN addgroup -S app && adduser -S app -G app
USER app
ENTRYPOINT ["node", "jobs.cjs"]
