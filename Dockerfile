# ---- Build stage ----
FROM public.ecr.aws/docker/library/node:22-alpine AS builder
WORKDIR /app

# Install ALL deps (including dev) so tsc is available
COPY package*.json ./
RUN npm ci

# Copy sources
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript -> dist
RUN npm run build

# Sanity check: entrypoint must exist
RUN test -f ./dist/server.js || (echo "dist/server.js missing"; ls -R; exit 1)

# ---- Runtime stage ----
FROM public.ecr.aws/docker/library/node:22-alpine AS runtime
WORKDIR /app

# Install ONLY production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user for security
USER node

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT||3001) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/server.js"]
