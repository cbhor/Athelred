FROM node:22-slim

# Install system dependencies for native modules (sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Ensure data directory exists for SQLite
RUN mkdir -p data

ENV NODE_ENV=production
EXPOSE 3000

# Start with tsx for the server
CMD ["npm", "start"]
