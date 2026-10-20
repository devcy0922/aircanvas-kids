# S-Kids 데모 이미지
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY data/ ./data/
COPY public/ ./public/
COPY server.js ./server.js

ENV PORT=8123
EXPOSE 8123

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8123/healthz"]

CMD ["node", "server.js"]
