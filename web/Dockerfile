FROM node:20-alpine

WORKDIR /app

# Install deps first (cached until the lockfile changes).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* are inlined at BUILD time, so they must be set before `next build`.
# The browser runs on the host and reaches the API via its published port -> localhost:8000.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_API_TOKEN=brookfield-alice-token
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_API_TOKEN=$NEXT_PUBLIC_API_TOKEN

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
