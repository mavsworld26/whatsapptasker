# Pin to a specific digest in production (docker pull node:22-bookworm-slim && docker inspect --format '{{index .RepoDigests 0}}').
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 DATABASE_PATH=/app/data/marketplace.sqlite
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
