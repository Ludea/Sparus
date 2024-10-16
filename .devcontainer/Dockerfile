FROM ghcr.io/lapce/lapdev-devcontainer-vnc

RUN apt-get update && apt install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \ 
    nodejs

RUN corepack enable pnpm