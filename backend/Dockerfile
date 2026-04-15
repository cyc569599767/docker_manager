FROM rust:1.82-bookworm AS builder
WORKDIR /app

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse \
    CARGO_HTTP_TIMEOUT=120 \
    CARGO_NET_RETRY=10

RUN mkdir -p /usr/local/cargo && \
    printf '[source.crates-io]\nreplace-with = "rsproxy"\n\n[source.rsproxy]\nregistry = "sparse+https://rsproxy.cn/index/"\n\n[net]\ngit-fetch-with-cli = true\nretry = 10\n' > /usr/local/cargo/config.toml

COPY Cargo.toml ./
COPY Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
WORKDIR /app
ARG DOCKER_CLI_VERSION=5:29.3.0-1~debian.12~bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

RUN install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends docker-ce-cli=${DOCKER_CLI_VERSION} && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/docker_manage_backend /usr/local/bin/docker_manage_backend
COPY data ./data

EXPOSE 8080
CMD ["docker_manage_backend"]
