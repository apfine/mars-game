// Client-Side Real-Time Presence & DSN Deep Space Network Link Service
export class PresenceClient {
  constructor(options = {}) {
    this.options = options;
    this.sessionId = this.getOrCreateSessionId();
    this.onlineCount = 1;
    this.rtt = 24; // Round trip time in ms
    this.pingInterval = null;
    this.channel = null;

    this.initBroadcastChannel();
    this.initLifecycle();
    this.ping();
    this.startHeartbeat();
  }

  getOrCreateSessionId() {
    if (typeof window === 'undefined') return 'srv_' + Math.random().toString(36);
    try {
      let id = window.sessionStorage.getItem('mars_session_id');
      if (!id) {
        id = 'exp_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
        window.sessionStorage.setItem('mars_session_id', id);
      }
      return id;
    } catch (_) {
      return 'exp_' + Math.random().toString(36).substring(2, 9);
    }
  }

  initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('mars_presence_bus');
        this.channel.onmessage = (event) => {
          const data = event.data;
          if (data && typeof data.count === 'number') {
            this.onlineCount = Math.max(1, data.count);
            this.notify(this.onlineCount, this.rtt);
          }
        };
      } catch (_) {}
    }
  }

  initLifecycle() {
    if (typeof window === 'undefined') return;

    // Refresh immediately when tab regains focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.ping();
      }
    });

    // Notify server immediately when window/tab is closed
    const leave = () => {
      try {
        if (this.channel) {
          this.channel.postMessage({ type: 'LEAVE', sessionId: this.sessionId });
        }
        if (navigator.sendBeacon) {
          const payload = JSON.stringify({ sessionId: this.sessionId, action: 'leave' });
          navigator.sendBeacon('/api/presence', payload);
        }
      } catch (_) {}
    };

    window.addEventListener('pagehide', leave);
    window.addEventListener('beforeunload', leave);
  }

  startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.ping();
    }, 9000); // 9-second ping maintains fresh heartbeat on server
  }

  async ping() {
    if (typeof window === 'undefined') return;

    const t0 = performance.now();
    try {
      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, action: 'ping' }),
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        const rtt = Math.round(performance.now() - t0);
        this.rtt = rtt;

        if (typeof data.online === 'number') {
          this.onlineCount = Math.max(1, data.online);
          this.notify(this.onlineCount, this.rtt);

          // Broadcast to sibling tabs on the same computer
          if (this.channel) {
            this.channel.postMessage({ count: this.onlineCount, rtt: this.rtt });
          }
        }
      }
    } catch (_) {
      // Offline fallback: at least self is 1
      this.notify(Math.max(1, this.onlineCount), 99);
    }
  }

  notify(count, rtt) {
    // 1. Update Rover Top Bar Element
    const roverEl = document.getElementById('online-count-val') || document.getElementById('online-players-count');
    if (roverEl) {
      roverEl.textContent = count;
    }

    // 2. Update Flight HUD Top Badge Element
    const flightEl = document.getElementById('flight-online-val');
    if (flightEl) {
      flightEl.textContent = count;
    }

    // 3. Update Scientific Telemetry Link RTT Displays
    const rttElements = document.querySelectorAll('.dsn-rtt-val');
    rttElements.forEach(el => {
      el.textContent = `${rtt}ms`;
    });

    if (this.options.onUpdate) {
      this.options.onUpdate(count, rtt);
    }
  }

  destroy() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.channel) {
      try { this.channel.close(); } catch (_) {}
    }
  }
}

// Global Singleton Instance
let clientInstance = null;
export function getPresenceClient() {
  if (!clientInstance && typeof window !== 'undefined') {
    clientInstance = new PresenceClient();
  }
  return clientInstance;
}
