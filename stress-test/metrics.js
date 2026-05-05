const os = require('os');

class MetricsCollector {
  constructor() {
    this.snapshots = [];
    this.requestResults = [];
    this.intervalId = null;
    this.startTime = null;
  }

  start(intervalMs = 1000) {
    this.startTime = Date.now();
    this.intervalId = setInterval(() => this.takeSnapshot(), intervalMs);
    this.takeSnapshot();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  takeSnapshot() {
    const now = Date.now();
    const elapsed = now - this.startTime;
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();

    const cpuUsage = process.cpuUsage();

    this.snapshots.push({
      timestamp: now,
      elapsedMs: elapsed,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers || 0,
      },
      system: {
        freeMem,
        totalMem,
        usedMemPercent: ((totalMem - freeMem) / totalMem * 100).toFixed(1),
        loadAvg1: loadAvg[0],
        loadAvg5: loadAvg[1],
        loadAvg15: loadAvg[2],
        cpuCount: cpus.length,
        uptime: os.uptime(),
      },
      process: {
        cpuUser: cpuUsage.user,
        cpuSystem: cpuUsage.system,
      },
    });
  }

  recordResults(results) {
    if (!Array.isArray(results)) return;
    this.requestResults.push(...results.map(r => ({
      ...r,
      recordedAt: Date.now(),
    })));
  }

  getSummary() {
    const lastSnap = this.snapshots[this.snapshots.length - 1] || {};
    const firstSnap = this.snapshots[0] || {};

    const allResults = this.requestResults;
    const okResults = allResults.filter(r => r.ok);
    const failResults = allResults.filter(r => !r.ok);

    const byLabel = {};
    for (const r of allResults) {
      if (!byLabel[r.label]) byLabel[r.label] = { ok: [], fail: [], total: 0 };
      byLabel[r.label].total++;
      if (r.ok) byLabel[r.label].ok.push(r.duration);
      else byLabel[r.label].fail.push(r);
    }

    const labelStats = {};
    for (const [label, data] of Object.entries(byLabel)) {
      const durations = data.ok.sort((a, b) => a - b);
      const count = durations.length;
      labelStats[label] = {
        totalRequests: data.total,
        successCount: count,
        failCount: data.fail.length,
        successRate: data.total > 0 ? (count / data.total * 100).toFixed(1) : '0',
        avgMs: count > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / count) : 0,
        minMs: count > 0 ? durations[0] : 0,
        maxMs: count > 0 ? durations[count - 1] : 0,
        p50Ms: count > 0 ? durations[Math.floor(count * 0.5)] : 0,
        p90Ms: count > 0 ? durations[Math.floor(count * 0.9)] : 0,
        p95Ms: count > 0 ? durations[Math.floor(count * 0.95)] : 0,
        p99Ms: count > 0 ? durations[Math.min(count - 1, Math.floor(count * 0.99))] : 0,
      };
    }

    const peakMem = this.snapshots.reduce((max, s) => Math.max(max, s.memory.heapUsed), 0);
    const peakRss = this.snapshots.reduce((max, s) => Math.max(max, s.memory.rss), 0);

    return {
      durationMs: lastSnap.elapsedMs || 0,
      durationSec: Math.round((lastSnap.elapsedMs || 0) / 1000),
      totalRequests: allResults.length,
      successCount: okResults.length,
      failCount: failResults.length,
      overallSuccessRate: allResults.length > 0 ? (okResults.length / allResults.length * 100).toFixed(1) : '0',
      overallAvgMs: okResults.length > 0 ? Math.round(okResults.reduce((s, r) => s + r.duration, 0) / okResults.length) : 0,
      overallP50Ms: (() => {
        const d = okResults.map(r => r.duration).sort((a, b) => a - b);
        return d.length > 0 ? d[Math.floor(d.length * 0.5)] : 0;
      })(),
      overallP95Ms: (() => {
        const d = okResults.map(r => r.duration).sort((a, b) => a - b);
        return d.length > 0 ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : 0;
      })(),
      overallP99Ms: (() => {
        const d = okResults.map(r => r.duration).sort((a, b) => a - b);
        return d.length > 0 ? d[Math.min(d.length - 1, Math.floor(d.length * 0.99))] : 0;
      })(),
      peakMemoryMB: Math.round(peakMem / 1024 / 1024),
      peakRssMB: Math.round(peakRss / 1024 / 1024),
      finalMemoryMB: Math.round((lastSnap.memory?.heapUsed || 0) / 1024 / 1024),
      finalRssMB: Math.round((lastSnap.memory?.rss || 0) / 1024 / 1024),
      systemUsedMemPercent: lastSnap.system?.usedMemPercent || '0',
      systemLoadAvg1: lastSnap.system?.loadAvg1 || 0,
      systemLoadAvg5: lastSnap.system?.loadAvg5 || 0,
      cpuCount: lastSnap.system?.cpuCount || 0,
      labelStats,
      snapshots: this.snapshots,
    };
  }

  reset() {
    this.snapshots = [];
    this.requestResults = [];
    this.startTime = null;
  }
}

module.exports = MetricsCollector;
