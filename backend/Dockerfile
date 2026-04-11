FROM rust:1.82-bookworm AS builder
WORKDIR /app

COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates docker.io && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/docker_manage_backend /usr/local/bin/docker_manage_backend
COPY data ./data

EXPOSE 8080
CMD ["docker_manage_backend"]
