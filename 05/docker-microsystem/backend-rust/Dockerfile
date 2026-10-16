# ---- build stage (使用最新穩定版，避免舊 Cargo 不支援 edition2024 依賴) ----
FROM rust:bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
RUN cargo build --release

# ---- runtime stage ----
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/api-rust ./
EXPOSE 8000
CMD ["./api-rust"]
