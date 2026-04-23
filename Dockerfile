FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/runtime/session /app/runtime/storage /app/runtime/state /app/runtime/logs

ENV NODE_ENV=production

CMD ["npm", "start"]
