const { eventBus } = require('./event_bus');

class LogInterceptor {
  constructor(options = {}) {
    this.maxLogs = options.maxLogs || 1000;
    this.logs = [];
    this.isIntercepting = false;
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
  }

  start() {
    if (this.isIntercepting) return;
    this.isIntercepting = true;

    const self = this;

    console.log = function (...args) {
      self.originalConsole.log.apply(console, args);
      self._recordLog('info', args);
    };

    console.info = function (...args) {
      self.originalConsole.info.apply(console, args);
      self._recordLog('info', args);
    };

    console.warn = function (...args) {
      self.originalConsole.warn.apply(console, args);
      self._recordLog('warn', args);
    };

    console.error = function (...args) {
      self.originalConsole.error.apply(console, args);
      self._recordLog('error', args);
    };
  }

  stop() {
    if (!this.isIntercepting) return;
    this.isIntercepting = false;
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
  }

  _recordLog(level, args) {
    const rawMessage = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return arg.stack || JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    let tag = 'SYS';
    let isError = level === 'error';

    if (isError || /error|exception|fail|rejected/i.test(rawMessage)) {
      tag = 'ERROR';
      isError = true;
    } else if (/\[CDP\]|chrome-remote-interface|devtools|websocket/i.test(rawMessage)) {
      tag = 'CDP';
    } else if (/\[BOT\]|telegraf|telegram|ctx\./i.test(rawMessage)) {
      tag = 'BOT';
    } else if (/\[WATCHER\]|heartbeat|sub-agent|task/i.test(rawMessage)) {
      tag = 'WATCHER';
    }

    const logEntry = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      timestamp: new Date().toISOString(),
      level: isError ? 'error' : level,
      tag,
      message: rawMessage,
      isError
    };

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    try {
      eventBus.emitEvent('log', logEntry);
    } catch (e) {
      // Avoid recursive crash
    }
  }

  getLogs(limit = 100, levelFilter = null) {
    let filtered = this.logs;
    if (levelFilter && levelFilter !== 'all') {
      filtered = filtered.filter(l => l.level === levelFilter || l.tag.toLowerCase() === levelFilter.toLowerCase());
    }
    return filtered.slice(-limit);
  }

  clear() {
    this.logs = [];
  }
}

const logInterceptor = new LogInterceptor();

module.exports = {
  logInterceptor,
  LogInterceptor
};
