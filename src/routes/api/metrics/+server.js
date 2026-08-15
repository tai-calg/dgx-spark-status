import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import si from 'systeminformation';
import { loadNotes } from '$lib/server/notes.js';

const execFileAsync = promisify(execFile);
const UPDATE_INTERVAL = 1000;
const LLAMA_SERVER = 'http://127.0.0.1:8001';
const OLLAMA_API = 'http://127.0.0.1:11434';
const SWITCH_MODEL_FILE = '/usr/local/bin/switch-model.sh';

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    shell: false,
    ...options
  });
}

async function getSizeGB(target) {
  try {
    const { stdout } = await run('du', ['-sb', target]);
    const bytes = Number.parseInt(stdout.trim().split(/\s+/)[0], 10);
    if (!Number.isFinite(bytes) || bytes < 1e9) return null;
    return Number.parseFloat((bytes / (1024 ** 3)).toFixed(1));
  } catch {
    return null;
  }
}

async function getAvailableModels() {
  const models = { llama: [], vllm: [] };

  try {
    const source = await readFile(SWITCH_MODEL_FILE, 'utf8');
    const contexts = new Map();

    for (const match of source.matchAll(/^CTX\[(\w+)\]="?(\d+)"?/gm)) {
      contexts.set(match[1], Number.parseInt(match[2], 10));
    }

    for (const match of source.matchAll(/^MODELS\[(\w+)\]="([^"]+)"/gm)) {
      const key = match[1];
      const modelPath = match[2];
      const rawName = basename(modelPath)
        .replace(/\.gguf.*$/, '')
        .replace(/-\d+-of-\d+$/, '')
        .replace(/^stepfun-ai_/, '');
      const sizeTarget = modelPath.includes('-00001-of-') ? dirname(modelPath) : modelPath;

      models.llama.push({
        key,
        name: rawName,
        sizeGB: await getSizeGB(sizeTarget),
        ctx: contexts.get(key) || null
      });
    }
  } catch {
    // switch-model.sh is optional.
  }

  try {
    const hubRoot = '/root/.cache/huggingface/hub';
    const entries = await readdir(hubRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('models--')) continue;
      const sizeGB = await getSizeGB(join(hubRoot, entry.name));
      if (sizeGB === null) continue;
      models.vllm.push({
        name: entry.name.replace(/^models--/, '').replace(/--/g, '/'),
        sizeGB
      });
    }
  } catch {
    // Hugging Face cache is optional.
  }

  try {
    const modelRoot = '/opt/models';
    const entries = await readdir(modelRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sizeGB = await getSizeGB(join(modelRoot, entry.name));
      if (sizeGB === null) continue;
      models.vllm.push({ name: entry.name, sizeGB });
    }
  } catch {
    // /opt/models is optional.
  }

  return models;
}

function parseModelMeta(modelId) {
  if (!modelId) return { model: null, quantFormat: null, paramSize: null };
  const quantMatch = modelId.match(/(Q\d+_K(?:_[A-Z]+)?|Q\d+_\d+|F16|F32|BF16|FP8|MXFP4)/i);
  const model = modelId
    .replace(/-\d+-of-\d+\.gguf.*$/, '')
    .replace(/\.gguf.*$/, '')
    .replace(/^.*\//, '');
  const paramMatch = model.match(/(\d+B)/i);
  return {
    model,
    quantFormat: quantMatch ? quantMatch[1] : null,
    paramSize: paramMatch ? paramMatch[1] : null
  };
}

async function getLlamaInfo() {
  let healthy = false;
  let loading = false;
  let processRunning = false;
  let model = 'unknown';
  let ctxSize = null;
  let quantFormat = null;
  let paramSize = null;

  try {
    const [healthRes, propsRes, slotsRes] = await Promise.allSettled([
      fetch(`${LLAMA_SERVER}/health`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${LLAMA_SERVER}/props`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${LLAMA_SERVER}/slots`, { signal: AbortSignal.timeout(2000) })
    ]);

    if (healthRes.status === 'fulfilled') {
      healthy = healthRes.value.ok;
      if (!healthy) {
        try {
          const body = await healthRes.value.json();
          loading = /loading model/i.test(body?.error?.message || '');
        } catch {}
      }
    }

    if (slotsRes.status === 'fulfilled' && slotsRes.value.ok) {
      const slots = await slotsRes.value.json();
      if (Array.isArray(slots) && slots.length > 0) ctxSize = slots[0]?.n_ctx || null;
    }

    if (!ctxSize && propsRes.status === 'fulfilled' && propsRes.value.ok) {
      const props = await propsRes.value.json();
      ctxSize = props?.default_generation_settings?.params?.n_ctx || null;
    }

    try {
      const response = await fetch(`${LLAMA_SERVER}/v1/models`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const data = await response.json();
        const parsed = parseModelMeta(data?.data?.[0]?.id || '');
        model = parsed.model || model;
        quantFormat = parsed.quantFormat;
        paramSize = parsed.paramSize;
      }
    } catch {}
  } catch {
    // Continue with local process fallbacks.
  }

  try {
    const { stdout } = await run('ps', ['-eo', 'args']);
    const command = stdout.split('\n').find((line) => /(^|\s)llama-server\s/.test(line));
    if (command) {
      processRunning = true;
      const modelMatch = command.match(/--model\s+(\S+)/);
      const ctxMatch = command.match(/--ctx-size\s+(\d+)/);
      if (modelMatch) {
        const parsed = parseModelMeta(modelMatch[1]);
        if (model === 'unknown') model = parsed.model || model;
        quantFormat ||= parsed.quantFormat;
        paramSize ||= parsed.paramSize;
      }
      if (!ctxSize && ctxMatch) ctxSize = Number.parseInt(ctxMatch[1], 10);
    }
  } catch {}

  if (model === 'unknown') {
    try {
      const { stdout } = await run('systemctl', ['show', 'llama-server', '-p', 'Description', '--value']);
      const match = stdout.match(/\(([^)]+)\)/);
      if (match) model = match[1];
    } catch {}
  }

  const status = healthy ? 'running' : (loading || processRunning ? 'loading' : 'stopped');
  return {
    engine: 'llama.cpp',
    available: status !== 'stopped',
    status,
    model,
    ctxSize,
    quantFormat,
    paramSize,
    port: 8001,
    proxyPort: 8000
  };
}

async function getVllmInfo() {
  try {
    const { stdout } = await run('docker', [
      'ps',
      '--filter', 'name=vllm',
      '--format', '{{.Names}}|{{.Status}}|{{.Ports}}'
    ]);

    const containers = stdout.trim()
      ? stdout.trim().split('\n').map((line) => {
          const [name, status, ports] = line.split('|');
          return { name, status, ports };
        })
      : [];

    let modelAlias = null;
    let modelFromPath = null;
    let loading = false;

    for (const endpoint of [8100, 8102, 8109]) {
      try {
        const response = await fetch(`http://127.0.0.1:${endpoint}/v1/models`, {
          signal: AbortSignal.timeout(2000)
        });
        const text = await response.text();
        if (/Loading model/i.test(text)) {
          loading = true;
          continue;
        }
        if (!response.ok || !text) continue;
        const data = JSON.parse(text);
        modelAlias = data?.data?.[0]?.id || modelAlias;
        if (modelAlias) break;
      } catch {}
    }

    if (containers.length > 0) {
      try {
        const names = containers.map((container) => container.name);
        const { stdout: inspectOut } = await run('docker', [
          'inspect',
          '--format', '{{.Name}}|{{json .Config.Cmd}}',
          ...names
        ]);

        for (const line of inspectOut.trim().split('\n').filter(Boolean)) {
          const separator = line.indexOf('|');
          if (separator < 0) continue;
          const command = JSON.parse(line.slice(separator + 1));
          const servedIndex = command.indexOf('--served-model-name');
          if (servedIndex >= 0 && command[servedIndex + 1]) modelAlias ||= command[servedIndex + 1];
          const serveIndex = command.indexOf('serve');
          if (serveIndex >= 0 && command[serveIndex + 1]) modelFromPath = basename(command[serveIndex + 1]);
          if (modelAlias || modelFromPath) break;
        }
      } catch {}
    }

    const model = modelFromPath || modelAlias;
    const status = containers.length === 0 ? 'stopped' : (model ? 'running' : (loading ? 'loading' : 'starting'));
    return {
      engine: 'vLLM',
      available: containers.length > 0,
      status,
      model,
      modelAlias,
      containers
    };
  } catch {
    return { engine: 'vLLM', available: false, status: 'stopped', model: null, containers: [] };
  }
}

async function getOllamaInfo() {
  try {
    const response = await fetch(`${OLLAMA_API}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error('Ollama unavailable');
    const data = await response.json();

    const models = (data.models || []).map((model) => ({
      name: model.name,
      sizeGB: model.size ? Number.parseFloat((model.size / (1024 ** 3)).toFixed(1)) : null,
      quantFormat: model.details?.quantization_level || null,
      paramSize: model.details?.parameter_size || null,
      family: model.details?.family || null,
      modified: model.modified_at
    }));

    let runningModel = null;
    try {
      const psResponse = await fetch(`${OLLAMA_API}/api/ps`, { signal: AbortSignal.timeout(2000) });
      if (psResponse.ok) {
        const psData = await psResponse.json();
        runningModel = psData.models?.[0]?.name || null;
      }
    } catch {}

    return { engine: 'Ollama', available: true, status: 'running', models, runningModel, port: 11434 };
  } catch {
    return { engine: 'Ollama', available: false, status: 'stopped', models: [], runningModel: null, port: 11434 };
  }
}

async function getTopProcesses(limit = 10) {
  try {
    const { stdout } = await run('ps', ['aux', '--sort=-%mem']);
    return stdout.split('\n').slice(1, limit + 1).filter(Boolean).map((line) => {
      const parts = line.trim().split(/\s+/);
      const rss = Number.parseInt(parts[5], 10);
      const executable = basename(parts[10] || 'unknown');
      return {
        user: parts[0],
        pid: Number.parseInt(parts[1], 10),
        cpu: Number.parseFloat(parts[2]),
        mem: Number.parseFloat(parts[3]),
        memoryMB: (rss / 1024).toFixed(1),
        memoryGB: (rss / 1024 / 1024).toFixed(2),
        command: executable
      };
    });
  } catch (error) {
    console.error('Error getting top processes:', error?.code || error?.name || 'unknown error');
    return [];
  }
}

async function getNvidiaGPUInfo() {
  try {
    const { stdout } = await run('nvidia-smi', [
      '--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit',
      '--format=csv,noheader,nounits'
    ]);

    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const values = line.split(',').map((value) => value.trim());
      const [index, name, memTotal, memUsed, memFree, utilGpu, utilMem, temp, powerDraw, powerLimit] = values;
      const parseValue = (value) => {
        if (value === '[N/A]' || value === 'N/A' || value === '') return null;
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? null : parsed;
      };

      return {
        index: Number.parseInt(index, 10),
        model: name,
        vendor: 'NVIDIA',
        memoryTotal: parseValue(memTotal),
        memoryUsed: parseValue(memUsed),
        memoryFree: parseValue(memFree),
        memoryTotalGB: parseValue(memTotal),
        memoryUsedGB: parseValue(memUsed),
        memoryFreeGB: parseValue(memFree),
        utilizationGpu: parseValue(utilGpu),
        utilizationMemory: parseValue(utilMem),
        temperatureGpu: parseValue(temp),
        powerDraw: parseValue(powerDraw),
        powerLimit: parseValue(powerLimit),
        unifiedMemory: memTotal === '[N/A]'
      };
    });
  } catch (error) {
    console.error('Error getting NVIDIA GPU info:', error?.code || error?.name || 'unknown error');
    return [];
  }
}

async function getSystemMetrics() {
  try {
    const [
      cpu,
      mem,
      currentLoad,
      osInfo,
      gpuData,
      processes,
      llamaInfo,
      vllmInfo,
      ollamaInfo,
      availableModels,
      fsSize,
      time,
      networkStats,
      modelNotes
    ] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.currentLoad(),
      si.osInfo(),
      getNvidiaGPUInfo(),
      getTopProcesses(10),
      getLlamaInfo(),
      getVllmInfo(),
      getOllamaInfo(),
      getAvailableModels(),
      si.fsSize(),
      si.time(),
      si.networkStats(),
      loadNotes()
    ]);

    const physical = networkStats.filter((network) =>
      network.iface !== 'lo' && !network.iface.startsWith('veth') && !network.iface.startsWith('br-')
    );
    const totalRx = physical.reduce((sum, network) => sum + (network.rx_sec || 0), 0);
    const totalTx = physical.reduce((sum, network) => sum + (network.tx_sec || 0), 0);
    const totalRxBytes = physical.reduce((sum, network) => sum + (network.rx_bytes || 0), 0);
    const totalTxBytes = physical.reduce((sum, network) => sum + (network.tx_bytes || 0), 0);

    return {
      timestamp: Date.now(),
      system: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        hostname: osInfo.hostname,
        arch: osInfo.arch
      },
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        speed: cpu.speed,
        usage: Number.parseFloat(currentLoad.currentLoad.toFixed(2)),
        perCore: currentLoad.cpus.map((core) => ({ load: Number.parseFloat(core.load.toFixed(2)) }))
      },
      memory: {
        total: mem.total,
        free: mem.free,
        used: mem.used,
        active: mem.active,
        available: mem.available,
        usagePercent: Number.parseFloat(((mem.used / mem.total) * 100).toFixed(2)),
        totalGB: Number.parseFloat((mem.total / (1024 ** 3)).toFixed(2)),
        usedGB: Number.parseFloat((mem.used / (1024 ** 3)).toFixed(2)),
        freeGB: Number.parseFloat((mem.free / (1024 ** 3)).toFixed(2))
      },
      gpu: gpuData,
      processes,
      inference: {
        llama: llamaInfo,
        vllm: vllmInfo,
        ollama: ollamaInfo,
        availableModels
      },
      disk: fsSize.map((disk) => ({
        type: disk.type,
        size: disk.size,
        used: disk.used,
        available: disk.available,
        usagePercent: Number.parseFloat(disk.use.toFixed(2)),
        mount: disk.mount,
        sizeGB: Number.parseFloat((disk.size / (1024 ** 3)).toFixed(2)),
        usedGB: Number.parseFloat((disk.used / (1024 ** 3)).toFixed(2)),
        availableGB: Number.parseFloat((disk.available / (1024 ** 3)).toFixed(2))
      })),
      uptime: {
        seconds: time.uptime,
        days: Math.floor(time.uptime / 86400),
        hours: Math.floor((time.uptime % 86400) / 3600),
        minutes: Math.floor((time.uptime % 3600) / 60)
      },
      network: [{
        iface: 'all',
        rx_sec: totalRx,
        tx_sec: totalTx,
        rx_bytes: totalRxBytes,
        tx_bytes: totalTxBytes,
        rx_sec_mb: Number.parseFloat((totalRx / (1024 ** 2)).toFixed(2)),
        tx_sec_mb: Number.parseFloat((totalTx / (1024 ** 2)).toFixed(2))
      }],
      modelNotes
    };
  } catch (error) {
    console.error('Error collecting metrics:', error?.code || error?.name || 'unknown error');
    return null;
  }
}

export async function GET({ request }) {
  const encoder = new TextEncoder();
  let interval = null;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(':ok\n\n'));

      const send = async () => {
        const metrics = await getSystemMetrics();
        if (metrics) controller.enqueue(encoder.encode(`data: ${JSON.stringify(metrics)}\n\n`));
      };

      try {
        await send();
        interval = setInterval(() => {
          send().catch((error) => {
            console.error('Error getting metrics:', error?.code || error?.name || 'unknown error');
            if (interval) clearInterval(interval);
            interval = null;
            try { controller.close(); } catch {}
          });
        }, UPDATE_INTERVAL);
      } catch (error) {
        console.error('Error getting initial metrics:', error?.code || error?.name || 'unknown error');
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      if (interval) clearInterval(interval);
      interval = null;
    }
  });

  request.signal.addEventListener('abort', () => {
    if (interval) clearInterval(interval);
    interval = null;
  }, { once: true });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
