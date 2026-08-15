# DGX Spark Status Dashboard

**English** | [日本語](README.ja.md)

A real-time monitoring dashboard for NVIDIA DGX Spark (GB10), covering CPU, unified memory, GPU, disk, network, processes, llama.cpp, vLLM, and Ollama.

![Dashboard Screenshot](docs/dashboard-screenshot.png)

## About this fork

This repository is an independently maintained, security-hardened fork intended primarily for local and private-network operation.

Key hardening changes:

- Binds to `127.0.0.1:9000` by default
- Makes LAN/remote exposure explicit opt-in
- Requires authentication for remote requests and fails closed when no token is configured
- Uses `execFile()` with argument arrays for Ollama operations instead of shell interpolation
- Rejects cross-origin state-changing requests for Ollama operations and model notes
- Does not stream full process command lines or local model filesystem paths to the browser
- Removes the duplicate legacy `dev-server.js` path so development and production share the same SvelteKit API implementation

See [SECURITY.md](SECURITY.md) for the threat model and deployment guidance.

## Features

### System monitoring

- CPU usage and per-core load
- Unified memory usage
- NVIDIA GPU utilization, temperature, and power through `nvidia-smi`
- Disk usage
- Aggregate network throughput
- Top memory-consuming processes without command-line arguments
- System uptime

### Inference engines

- llama.cpp server and loaded-model status
- vLLM container and model status
- Ollama model inventory and management
- Per-model notes

### UI

- Server-Sent Events (SSE) updates every second
- Compact responsive dashboard
- Dark theme
- Model inventory cards

## Requirements

- Linux
- Primary target: Ubuntu 24.04 ARM64 / DGX Spark GB10
- A Node.js version compatible with the project dependencies
- NVIDIA driver and `nvidia-smi`
- Ollama, llama.cpp, and/or vLLM for the corresponding panels

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

The default server is loopback-only and is not reachable from other machines on the LAN.

## Trusted-LAN access

Generate a sufficiently long random token and explicitly enable remote binding:

```bash
export DGX_ALLOW_REMOTE=1
export DGX_DASHBOARD_TOKEN='replace-with-a-random-secret-at-least-16-characters-long'
npm run dev
```

The server then binds to `0.0.0.0:9000` and requires HTTP Basic authentication:

- Username: `dgx`
- Password: the value of `DGX_DASHBOARD_TOKEN`

HTTP Basic authentication does not encrypt transport. Do not expose port 9000 directly to the public Internet. Use TLS through a reverse proxy or access the dashboard through a VPN when crossing an untrusted network.

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

The security regression tests cover at least:

- default loopback binding
- fail-closed remote configuration
- authentication behavior
- absence of shell interpolation in the Ollama management route

## API

### `GET /api/metrics`

Streams dashboard metrics over SSE. Remote requests are protected by the authentication policy.

### `GET|POST /api/notes`

Reads and updates per-model notes.

Default storage path:

```text
/opt/dgx-spark-status/model-notes.json
```

Override it with `DGX_NOTES_FILE`.

### `POST /api/ollama`

Supported actions:

- `pull`
- `delete`
- `load`
- `unload`

Model identifiers are validated and passed to the Ollama executable as arguments without invoking a shell.

## Security guidance

This fork is safer than the original implementation, but the dashboard still exposes operational information about the host, GPU, and inference stack. It is not intended to be operated as a public Internet-facing service.

Recommended deployment:

1. Keep the default `127.0.0.1` binding for single-machine use.
2. Enable `DGX_ALLOW_REMOTE=1` only when LAN access is actually required.
3. Use a VPN or TLS-enabled reverse proxy when traffic crosses an untrusted network.
4. Never commit `DGX_DASHBOARD_TOKEN` to the repository.

## Credits

Originally created by Phanes / Viroscope at OnticEntia.ai and later extended by thx0701.

This repository is an independently maintained security-hardened fork by `tai-calg`.

## License

MIT
