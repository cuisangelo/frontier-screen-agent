FROM node:24-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate \
    && pnpm add -g @earendil-works/pi-coding-agent@1.1.0

WORKDIR /app
COPY src ./src

ENV PORT=8080 DATA_DIR=/data PI_BIN=/pnpm/pi \
    AGENT_MODEL=anthropic/claude-sonnet-5.5 GUARD_MODEL=anthropic/claude-haiku-5.5
EXPOSE 8080
CMD ["node", "--openssl-legacy-provider", "src/server.ts"]
