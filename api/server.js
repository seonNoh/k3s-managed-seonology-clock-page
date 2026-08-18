const { createApp } = require('./app');
const { loadConfig } = require('./config');

function start(dependencies = {}) {
  const config = dependencies.config || loadConfig();
  const app = createApp(dependencies);
  return app.listen(config.port, () => {
    console.log(`API server running on port ${config.port}`);
  });
}

if (require.main === module) start();

module.exports = { start };
