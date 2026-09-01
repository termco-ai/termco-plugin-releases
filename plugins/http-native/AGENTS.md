# HTTP provider ownership

- Preserve DNS-rebinding and SSRF protections.
- Never follow redirects implicitly.
- Close every per-request dispatcher.
- Consumers use `network.http`; never import this implementation.
