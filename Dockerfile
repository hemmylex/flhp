FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
