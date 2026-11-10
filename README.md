# VPS Web Proxy

A small, public HTTP/HTTPS web proxy with a browser UI. It is intended as a self-hosted convenience tool, not an anonymity service.

## Deploy on an Ubuntu/Debian VPS

You need:
- A VPS with a public IPv4 address (1 GB RAM is generally sufficient for light use).
- A domain name or subdomain pointing to the VPS.
- Docker Engine and the Docker Compose plugin.

### 1. Point your domain

Create an `A` record such as `proxy.example.com` pointing to your VPS IPv4 address. If you publish an `AAAA` record, make sure IPv6 reaches this VPS too.

### 2. Install Docker

On Ubuntu, install Docker Engine and the Compose plugin using the official Docker instructions:
https://docs.docker.com/engine/install/ubuntu/

### 3. Upload and configure

Upload and unzip this project on the VPS, then edit `Caddyfile` and replace `proxy.example.com` with your real domain.

Open inbound TCP ports 80 and 443 in your VPS firewall. Do not expose port 3000 publicly.

### 4. Start the site

From the project directory:

```bash
docker compose up -d --build
docker compose logs -f
```

Caddy will automatically request and renew a TLS certificate once DNS is correct and ports 80/443 are reachable.

### 5. Visit your proxy

Open `https://proxy.example.com`, replacing the example with your configured domain.

## Useful commands

```bash
docker compose ps
docker compose logs -f web-proxy
docker compose restart
docker compose down
docker compose up -d --build
```

## Deploy free on Render (no VPS or custom domain)

1. Connect this GitHub repository to Render.
2. Choose **New → Blueprint** and select this repository. Render detects `render.yaml`.
3. Review the proposed service and deploy it.
4. Render provides a public `onrender.com` URL when the first deploy completes.

The included Blueprint uses the free plan. Free web services can spin down after inactivity and take a short while to wake up; availability and limits can change.

## Security and limitations

- This service is public: anyone who knows the URL can use it. It has a per-IP rate limit of 30 requests/minute.
- Only HTTP/HTTPS and standard ports 80/443 are accepted. Private/reserved IPs, localhost, local hostnames, and URLs containing credentials are blocked.
- Outbound connections are pinned to validated public DNS addresses and redirects are rechecked.
- The proxy only fetches GET requests, limits response size, and has a request timeout. Some websites will not render or function correctly; this is a lightweight proxy, not a full browser engine.
- Do not use it to access accounts or submit passwords. Remote pages are untrusted content.
- Public proxies attract abuse. Monitor logs and bandwidth, keep dependencies updated, and consider adding authentication and stronger per-user quotas before wider publication.
- Check your hosting provider's acceptable-use policy. Providers may suspend services that operate as open proxies.
