# Multi-stage Dockerfile for Venatus

FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# Native build dependencies for sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# Use npm install because package-lock may not exist initially
RUN npm install --omit=dev

COPY . .

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /usr/src/app

# Runtime libs for sqlite
RUN apk add --no-cache sqlite-libs

COPY --from=builder /usr/src/app /usr/src/app

EXPOSE 3000
CMD ["node", "src/server.js"]


