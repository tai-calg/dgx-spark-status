import si from 'systeminformation';

function round(value, digits = 2) {
  const numeric = Number(value) || 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

export async function GET() {
  try {
    const snapshot = await si.processes();
    const processes = (snapshot.list || []).map((process) => ({
      pid: Number(process.pid) || 0,
      parentPid: Number(process.parentPid) || 0,
      user: process.user || '',
      name: process.name || process.command || 'unknown',
      command: process.command || process.name || '',
      params: process.params || '',
      cpu: round(process.cpu),
      mem: round(process.mem),
      memoryMB: round((Number(process.memRss) || 0) / 1024, 1),
      state: process.state || ''
    }));

    return new Response(JSON.stringify({
      timestamp: Date.now(),
      counts: {
        all: Number(snapshot.all) || processes.length,
        running: Number(snapshot.running) || 0,
        sleeping: Number(snapshot.sleeping) || 0,
        blocked: Number(snapshot.blocked) || 0
      },
      processes
    }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('Error collecting process snapshot:', error?.code || error?.name || 'unknown error');
    return new Response(JSON.stringify({ error: 'process_snapshot_unavailable' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
}
