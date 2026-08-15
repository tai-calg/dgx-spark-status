# DGX Spark Status Dashboard

Real-time monitoring dashboard for NVIDIA DGX Spark (GB10), including CPU, unified memory, GPU, disk, network, process, llama.cpp, vLLM, and Ollama status.

![Dashboard Screenshot](docs/dashboard-screenshot.png)

## Security defaults in this fork

This fork is hardened for local/private operation.

- Binds to `127.0.0.1:9000` by default.
- Remote/LAN access is explicit opt-in.
- Remote requests require authentication and fail closed when no token is configured.
- Ollama model operations use `execFile()` with argument arrays rather than shell interpolation.
- Cross-origin state-changing Ollama and notes requests are rejected.
- Full process command lines and local model filesystem paths are not streamed to the browser.
- The old duplicate `dev-server.js` entrypoint has been removed so development and production use the same SvelteKit API routes.

See [SECURITY.md](SECURITY.md) for the threat model and deployment details.

## Features

### System monitoring

- CPU usage and per-core load
- Unified memory usage
- NVIDIA GPU utilization, temperature, and power via `nvidia-smi`
- Disk usage
- Aggregate network throughput
- Top memory-consuming processes without command-line arguments
- System uptime

### Inference engines

- llama.cpp server/model status
- vLLM container/model status
- Ollama model inventory and management API
- Per-model notes

### UI

- Server-Sent Events (SSE) updates every second
- Compact responsive dashboard
- Dark theme
- Model inventory cards

## Prerequisites

- Linux; tested target is Ubuntu 24.04 ARM64 / DGX Spark GB10
- Node.js compatible with the versions declared by the dependencies
- NVIDIA driver and `nvidia-smi`
- Ollama, llama.cpp, and/or vLLM as required for the corresponding panels

## Local quick start

```bash
git clone https://github.com/tai-calg/dgx-spark-status.git
cd dgx-spark-status
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:9000
```

The default server is loopback-only.

## Trusted-LAN access

Generate a sufficiently long random token and explicitly enable remote binding:

```bash
export DGX_ALLOW_REMOTE=1
export DGX_DASHBOARD_TOKEN='replace-with-a-random-secret-at-least-16-characters-long'
npm run dev
```

The server then binds to `0.0.0.0:9000` and HTTP Basic authentication is required:

- Username: `dgx`
- Password: the value of `DGX_DASHBOARD_TOKEN`

Basic authentication does not encrypt the connection. Do not expose port 9000 directly to the public Internet. Use TLS through a reverse proxy or access the dashboard through a VPN when the network is not trusted.

Change the port with `DGX_PORT`.

## Production

```bash
npm run build
npm start
```

The same loopback/remote-access policy applies to the production server.

## Tests

```bash
npm test
```

The security regression tests verify the default loopback binding, fail-closed remote configuration, authentication behavior, and the absence of shell interpolation in the Ollama management route.

## API

### `GET /api/metrics`

SSE stream containing the dashboard metrics. Remote requests are protected by the authentication policy.

### `GET|POST /api/notes`

Read and update model notes. Notes are stored in `/opt/dgx-spark-status/model-notes.json` by default. Override with `DGX_NOTES_FILE`.

### `POST /api/ollama`

Supported actions:

- `pull`
- `delete`
- `load`
- `unload`

Model identifiers are validated and passed to the Ollama executable as arguments without invoking a shell.

## Credits

Originally created by Phanes / Viroscope at OnticEntia.ai and later extended by thx0701. This repository is an independently maintained security-hardened fork.

## License

MIT
