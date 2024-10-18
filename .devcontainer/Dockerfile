FROM ghcr.io/lapce/lapdev-devcontainer-gnome

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
    nodejs \
    npn \
    git

RUN npm install -g pnpm

RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
