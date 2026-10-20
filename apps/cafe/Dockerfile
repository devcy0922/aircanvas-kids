# 엄빠(서울형 키즈카페) 데모 이미지
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY data/ ./data/
COPY public/ ./public/
COPY server.js ./server.js

ENV PORT=8124
EXPOSE 8124

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8124/healthz"]

CMD ["node", "server.js"]
