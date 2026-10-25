FROM rust:1.85-bookworm AS builder

WORKDIR /src
COPY server/Cargo.toml server/Cargo.lock ./server/
COPY server/src ./server/src

RUN cargo build --locked --release --manifest-path server/Cargo.toml

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG AIRCANVAS_VERSION=0.1.0
ARG GIT_SHA=unknown
ENV AIRCANVAS_VERSION=${AIRCANVAS_VERSION}
ENV GIT_SHA=${GIT_SHA}
ENV HT_BIND=0.0.0.0:7180

COPY --from=builder /src/server/target/release/aircanvas-relay /usr/local/bin/aircanvas-relay

EXPOSE 7180
ENTRYPOINT ["/usr/local/bin/aircanvas-relay"]
