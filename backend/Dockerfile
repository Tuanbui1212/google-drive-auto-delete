FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

COPY package*.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

# Create data directories for SQLite and thumbnails
RUN mkdir -p /app/data/thumbnails

EXPOSE 5000
CMD ["npm", "run", "start:prod"]
