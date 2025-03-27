const Flowdoc = require('./Flowdoc');

class FlowdocManager {
  constructor() {
    this.instances = new Map();
  }

  getInstance(options) {
    const { nodule, item } = options;
    const key = this._generateKey(nodule, item);

    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    const flowdocInstance = new Flowdoc(options);
    this.instances.set(key, flowdocInstance);
    return flowdocInstance;
  }

  _generateKey(nodule, item) {
    const itemKey = Array.isArray(item) ? item.join('_') : item;
    return `${nodule}_${itemKey}`;
  }
}

module.exports = new FlowdocManager();
