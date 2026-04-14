FROM node:20-slim

WORKDIR /app

# Only install production server dependencies (no Puppeteer)
COPY package-server.json ./package.json
RUN npm install --omit=dev

COPY server.js .
COPY public/ ./public/

RUN mkdir -p data logs

EXPOSE 3000

CMD ["node", "server.js"]
