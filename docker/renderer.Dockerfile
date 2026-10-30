FROM node:24-bookworm-slim@sha256:8579e5fce559544b50072d05cc5d3b84b6a14d0989ae56c331d9e983a36a21f1
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY packages ./packages
COPY scripts ./scripts
COPY apps/renderer/src ./apps/renderer/src
COPY tsconfig.json tsconfig.custom-scenes.json ./
RUN chmod 1777 /app && mkdir /work && chmod 1777 /work
ENV HOME=/tmp REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
USER node
