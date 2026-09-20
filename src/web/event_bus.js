const EventEmitter = require('events');

class WebEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.recentEvents = [];
    this.maxRecentEvents = 100;
  }

  emitEvent(type, payload = {}) {
    const eventItem = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      type,
      payload,
      timestamp: new Date().toISOString()
    };

    this.recentEvents.unshift(eventItem);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.pop();
    }

    this.emit('broadcast', eventItem);
    this.emit(type, eventItem);
    return eventItem;
  }

  getRecentEvents() {
    return [...this.recentEvents];
  }

  clear() {
    this.recentEvents = [];
  }
}

const eventBus = new WebEventBus();

module.exports = {
  eventBus,
  WebEventBus
};
