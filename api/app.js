function createApp(dependencies = {}) {
  if (dependencies.app) return dependencies.app;
  return require('./index').app;
}

module.exports = { createApp };
