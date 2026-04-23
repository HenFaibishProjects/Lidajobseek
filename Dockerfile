# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all files for workspace building
COPY . .

# Install dependencies for the whole workspace
RUN npm ci

# Build the backend and frontend
# The frontend build outputs to root dist/public according to ui/angular.json
# The backend build outputs to backend/dist according to its tsconfig
RUN npm run build

# Final production stage
FROM node:20-alpine

WORKDIR /app

# Copy only what's needed for runtime
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/dist ./dist

# Ensure the uploads directory exists
RUN mkdir -p uploads

EXPOSE 3000

ENV NODE_ENV=production

# Start using the backend workspace which is the main server
CMD ["npm", "run", "start", "-w", "backend"]
