# Container Runtimes

This source-owning provider implements `containers.runtime` for Docker, Podman,
and Apple containers. Remote operations reuse `ssh.client` and therefore share
its single connection pool.
