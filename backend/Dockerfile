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
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates docker.io && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/docker_manage_backend /usr/local/bin/docker_manage_backend
COPY data ./data

EXPOSE 8080
CMD ["docker_manage_backend"]
