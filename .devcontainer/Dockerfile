FROM ghcr.io/lapce/lapdev-devcontainer-gnome:latest

RUN apt update && apt install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \ 
    nodejs \
    npm \
    git

RUN curl -fsSL https://vite.plus | bash
