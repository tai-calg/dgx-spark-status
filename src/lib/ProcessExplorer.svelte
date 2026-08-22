<script>
  import { onMount, onDestroy } from 'svelte';

  const REFRESH_MS = 2000;

  let processes = $state([]);
  let counts = $state({ all: 0, running: 0, sleeping: 0, blocked: 0 });
  let loading = $state(true);
  let error = $state('');
  let query = $state('');
  let userFilter = $state('all');
  let sortKey = $state('cpu');
  let sortDirection = $state('desc');
  let fetching = $state(false);
  let timer = null;
  let abortController = null;

  let users = $derived(
    [...new Set(processes.map((process) => process.user).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  );

  let filteredProcesses = $derived.by(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const direction = sortDirection === 'asc' ? 1 : -1;

    const filtered = processes.filter((process) => {
      if (userFilter !== 'all' && process.user !== userFilter) return false;
      if (!normalizedQuery) return true;

      return [
        process.name,
        process.command,
        process.params,
        process.user,
        String(process.pid)
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') {
        return String(a.name || '').localeCompare(String(b.name || '')) * direction;
      }
      if (sortKey === 'user') {
        return String(a.user || '').localeCompare(String(b.user || '')) * direction;
      }

      const aValue = sortKey === 'memory' ? Number(a.memoryMB) || 0 : Number(a[sortKey]) || 0;
      const bValue = sortKey === 'memory' ? Number(b.memoryMB) || 0 : Number(b[sortKey]) || 0;
      return (aValue - bValue) * direction;
    });
  });

  async function loadProcesses() {
    if (fetching) return;
    fetching = true;
    const controller = new AbortController();
    abortController = controller;

    try {
      const response = await fetch('/api/processes', {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const snapshot = await response.json();
      processes = Array.isArray(snapshot.processes) ? snapshot.processes : [];
      counts = snapshot.counts || { all: processes.length, running: 0, sleeping: 0, blocked: 0 };
      error = '';
    } catch (loadError) {
      if (loadError?.name !== 'AbortError') error = 'Process data unavailable';
    } finally {
      if (abortController === controller) abortController = null;
      fetching = false;
      loading = false;
    }
  }

  function setSort(nextKey) {
    if (sortKey === nextKey) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }

    sortKey = nextKey;
    sortDirection = nextKey === 'name' || nextKey === 'user' ? 'asc' : 'desc';
  }

  function sortIndicator(key) {
    if (sortKey !== key) return '';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  function ariaSort(key) {
    if (sortKey !== key) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function formatPercent(value) {
    const numeric = Number(value) || 0;
    return `${numeric.toFixed(numeric >= 10 ? 1 : 2)}%`;
  }

  function formatMemory(memoryMB) {
    const numeric = Number(memoryMB) || 0;
    if (numeric >= 1024) {
      const gb = numeric / 1024;
      return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
    }
    return `${numeric.toFixed(numeric >= 100 ? 0 : 1)} MB`;
  }

  function fullCommand(process) {
    return [process.command, process.params].filter(Boolean).join(' ').trim() || process.name;
  }

  onMount(() => {
    loadProcesses();
    timer = setInterval(loadProcesses, REFRESH_MS);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    timer = null;
    abortController?.abort();
  });
</script>

<section class="process-card" aria-labelledby="process-heading">
  <div class="process-toolbar">
    <div class="process-heading-group">
      <div class="eyebrow">System activity</div>
      <div class="process-title-line">
        <h2 id="process-heading">Processes</h2>
        <span class="process-count">{counts.all || processes.length} total</span>
        <span class="process-count running">{counts.running || 0} running</span>
      </div>
    </div>

    <div class="process-controls">
      <label class="search-box">
        <span class="search-icon" aria-hidden="true"></span>
        <span class="sr-only">Search processes</span>
        <input
          type="search"
          bind:value={query}
          placeholder="Search process, PID or user"
          autocomplete="off"
          spellcheck="false"
        />
        {#if query}
          <button class="clear-search" type="button" aria-label="Clear process search" onclick={() => query = ''}>×</button>
        {/if}
      </label>

      <label class="user-filter">
        <span class="sr-only">Filter processes by user</span>
        <select bind:value={userFilter} aria-label="Filter processes by user">
          <option value="all">All users</option>
          {#each users as user}
            <option value={user}>{user}</option>
          {/each}
        </select>
      </label>
    </div>
  </div>

  <div class="process-subbar">
    <span>{filteredProcesses.length} shown</span>
    <span class="refresh-state">{error || (fetching ? 'Refreshing…' : 'Live · 2s')}</span>
  </div>

  <div class="process-table-shell">
    <table class="process-table">
      <thead>
        <tr>
          <th class="name-column" aria-sort={ariaSort('name')}>
            <button type="button" class="sort-button" onclick={() => setSort('name')}>Process <span>{sortIndicator('name')}</span></button>
          </th>
          <th class="pid-column" aria-sort={ariaSort('pid')}>
            <button type="button" class="sort-button numeric" onclick={() => setSort('pid')}>PID <span>{sortIndicator('pid')}</span></button>
          </th>
          <th class="user-column" aria-sort={ariaSort('user')}>
            <button type="button" class="sort-button" onclick={() => setSort('user')}>User <span>{sortIndicator('user')}</span></button>
          </th>
          <th class="cpu-column" aria-sort={ariaSort('cpu')}>
            <button type="button" class="sort-button numeric active-metric" onclick={() => setSort('cpu')}>CPU <span>{sortIndicator('cpu')}</span></button>
          </th>
          <th class="memory-column" aria-sort={ariaSort('memory')}>
            <button type="button" class="sort-button numeric" onclick={() => setSort('memory')}>Memory <span>{sortIndicator('memory')}</span></button>
          </th>
          <th class="mem-percent-column" aria-sort={ariaSort('mem')}>
            <button type="button" class="sort-button numeric" onclick={() => setSort('mem')}>Mem % <span>{sortIndicator('mem')}</span></button>
          </th>
        </tr>
      </thead>
      <tbody>
        {#if loading && processes.length === 0}
          <tr><td colspan="6" class="table-state">Loading processes…</td></tr>
        {:else if filteredProcesses.length === 0}
          <tr><td colspan="6" class="table-state">No matching processes</td></tr>
        {:else}
          {#each filteredProcesses as process (process.pid)}
            <tr>
              <td class="name-cell" title={fullCommand(process)}>
                <div class="process-name-row">
                  <span class="state-dot {process.state === 'running' ? 'is-running' : ''}" aria-hidden="true"></span>
                  <span class="process-name">{process.name}</span>
                </div>
                {#if process.command && process.command !== process.name}
                  <div class="process-command">{process.command}</div>
                {/if}
              </td>
              <td class="numeric pid-cell">{process.pid}</td>
              <td class="user-cell">{process.user || '—'}</td>
              <td class="numeric metric-cell cpu-cell">
                <span class="metric-value">{formatPercent(process.cpu)}</span>
                <span class="metric-track" aria-hidden="true"><span class="metric-fill cpu-fill" style:width={`${Math.min(Number(process.cpu) || 0, 100)}%`}></span></span>
              </td>
              <td class="numeric metric-cell memory-cell">
                <span class="metric-value">{formatMemory(process.memoryMB)}</span>
                <span class="metric-track" aria-hidden="true"><span class="metric-fill memory-fill" style:width={`${Math.min(Number(process.mem) || 0, 100)}%`}></span></span>
              </td>
              <td class="numeric mem-percent-cell">{formatPercent(process.mem)}</td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>

<style>
  .process-card {
    margin-bottom: 0.5rem;
    overflow: hidden;
    background: linear-gradient(180deg, #14171a 0%, #101214 100%);
    border: 1px solid #292d31;
    border-radius: 12px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
  }

  .process-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 0.8rem 0.55rem;
  }

  .process-heading-group {
    min-width: 0;
  }

  .eyebrow {
    margin-bottom: 0.08rem;
    color: #6f767d;
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .process-title-line {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    min-width: 0;
  }

  h2 {
    margin: 0;
    color: #f4f6f7;
    font-size: 0.95rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .process-count {
    color: #8a9198;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .process-count.running {
    color: #8ebd3f;
  }

  .process-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.45rem;
    min-width: min(34rem, 55%);
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 12rem;
  }

  .search-icon {
    position: absolute;
    left: 0.65rem;
    width: 0.62rem;
    height: 0.62rem;
    border: 1.5px solid #747b82;
    border-radius: 50%;
    pointer-events: none;
  }

  .search-icon::after {
    content: '';
    position: absolute;
    right: -0.28rem;
    bottom: -0.2rem;
    width: 0.35rem;
    height: 1.5px;
    background: #747b82;
    transform: rotate(45deg);
    transform-origin: left center;
  }

  .search-box input,
  .user-filter select {
    width: 100%;
    height: 2rem;
    color: #e4e7e9;
    background: #0c0e10;
    border: 1px solid #2c3136;
    border-radius: 7px;
    font: inherit;
    font-size: 0.72rem;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }

  .search-box input {
    padding: 0 2rem 0 1.75rem;
  }

  .search-box input::placeholder {
    color: #697078;
  }

  .search-box input:focus,
  .user-filter select:focus {
    background: #101316;
    border-color: #596168;
    box-shadow: 0 0 0 2px rgba(118, 185, 0, 0.12);
  }

  .clear-search {
    position: absolute;
    right: 0.35rem;
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    padding: 0;
    color: #858c93;
    background: transparent;
    border: 0;
    border-radius: 50%;
    font-size: 1rem;
    line-height: 1;
  }

  .clear-search:hover {
    color: #d5d9dc;
    background: #202428;
    border-color: transparent;
  }

  .user-filter {
    width: 7.8rem;
    flex-shrink: 0;
  }

  .user-filter select {
    padding: 0 0.55rem;
  }

  .process-subbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 1.55rem;
    padding: 0 0.8rem;
    color: #686f76;
    border-top: 1px solid #1d2023;
    border-bottom: 1px solid #25292d;
    font-size: 0.6rem;
    font-variant-numeric: tabular-nums;
  }

  .refresh-state {
    color: #777f86;
  }

  .process-table-shell {
    max-height: 335px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: #3b4146 transparent;
  }

  .process-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 0;
    background: rgba(20, 23, 26, 0.97);
    border-bottom: 1px solid #2b3034;
    backdrop-filter: blur(8px);
  }

  .sort-button {
    display: flex;
    align-items: center;
    gap: 0.28rem;
    width: 100%;
    height: 1.85rem;
    padding: 0 0.65rem;
    color: #747b82;
    background: transparent;
    border: 0;
    border-radius: 0;
    font-size: 0.61rem;
    font-weight: 650;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .sort-button.numeric {
    justify-content: flex-end;
  }

  .sort-button:hover,
  .sort-button:focus-visible {
    color: #d4d8da;
    background: #1a1e21;
    border-color: transparent;
  }

  .sort-button.active-metric {
    color: #9ca3a9;
  }

  tbody tr {
    border-bottom: 1px solid #1f2326;
    transition: background 0.1s;
  }

  tbody tr:last-child {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: #181c1f;
  }

  td {
    height: 2.45rem;
    padding: 0.34rem 0.65rem;
    overflow: hidden;
    color: #c8cdd1;
    font-size: 0.69rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name-column { width: 28%; }
  .pid-column { width: 8%; }
  .user-column { width: 13%; }
  .cpu-column { width: 18%; }
  .memory-column { width: 19%; }
  .mem-percent-column { width: 14%; }

  .numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .process-name-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  .state-dot {
    width: 0.36rem;
    height: 0.36rem;
    flex: 0 0 auto;
    background: #4a5055;
    border-radius: 50%;
  }

  .state-dot.is-running {
    background: #76b900;
    box-shadow: 0 0 0 2px rgba(118, 185, 0, 0.1);
  }

  .process-name {
    min-width: 0;
    overflow: hidden;
    color: #f0f2f3;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .process-command {
    margin-top: 0.02rem;
    padding-left: 0.8rem;
    overflow: hidden;
    color: #686f75;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.56rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pid-cell,
  .mem-percent-cell {
    color: #8c949b;
  }

  .user-cell {
    color: #8b969d;
  }

  .metric-cell {
    position: relative;
  }

  .metric-value {
    position: relative;
    z-index: 1;
    display: block;
  }

  .cpu-cell .metric-value {
    color: #dfb45a;
  }

  .memory-cell .metric-value {
    color: #9fc45b;
  }

  .metric-track {
    position: absolute;
    right: 0.65rem;
    bottom: 0.28rem;
    left: 32%;
    height: 2px;
    overflow: hidden;
    background: #24292d;
    border-radius: 999px;
  }

  .metric-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition: width 0.3s ease;
  }

  .cpu-fill {
    background: #c8963c;
  }

  .memory-fill {
    background: #76b900;
  }

  .table-state {
    height: 5rem;
    color: #747b82;
    text-align: center;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 900px) {
    .process-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 0.55rem;
    }

    .process-controls {
      width: 100%;
      min-width: 0;
    }

    .user-column,
    .user-cell,
    .mem-percent-column,
    .mem-percent-cell {
      display: none;
    }

    .name-column { width: 38%; }
    .pid-column { width: 12%; }
    .cpu-column { width: 24%; }
    .memory-column { width: 26%; }
  }

  @media (max-width: 600px) {
    .process-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .search-box,
    .user-filter {
      width: 100%;
      min-width: 0;
    }

    .pid-column,
    .pid-cell {
      display: none;
    }

    .name-column { width: 46%; }
    .cpu-column { width: 25%; }
    .memory-column { width: 29%; }

    td,
    .sort-button {
      padding-right: 0.45rem;
      padding-left: 0.45rem;
    }

    .metric-track {
      right: 0.45rem;
      left: 28%;
    }
  }
</style>
