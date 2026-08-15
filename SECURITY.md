# Security

## Default network exposure

The dashboard binds to `127.0.0.1:9000` by default. This is intentional because the metrics endpoint exposes operational information about the host.

To allow access from another machine on a trusted LAN, set both variables before starting the application:

```bash
export DGX_ALLOW_REMOTE=1
export DGX_DASHBOARD_TOKEN='use-a-random-secret-of-at-least-16-characters'
npm run dev
```

Remote mode binds to `0.0.0.0` and requires HTTP Basic authentication. Use the fixed username `dgx` and the value of `DGX_DASHBOARD_TOKEN` as the password.

HTTP Basic authentication does not encrypt traffic. Do not expose port 9000 directly to the public Internet. Put the dashboard behind a TLS-terminating reverse proxy or a VPN if traffic can traverse an untrusted network.

`DGX_PORT` can be used to change the listening port.

## Ollama management API

The Ollama management endpoint executes the `ollama` binary with `execFile()` and an argument array. It does not interpolate the model name into a shell command. Model names are validated before execution, and cross-origin state-changing requests are rejected.

## Metrics privacy

The dashboard does not stream full process command-line arguments, local model filesystem paths, filesystem device names, or per-interface network details. These values are not required for the dashboard UI and can contain sensitive machine-specific information.

## Reporting

This fork is maintained for local/private use. Do not publish machine-specific logs, model paths, access tokens, or dashboard credentials in public issues.
