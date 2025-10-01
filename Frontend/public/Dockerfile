# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install only prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

ENV NODE_ENV=production
# We’ll bind to 8080 inside the container
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
