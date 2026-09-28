import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();
const { app, logger } = createApp(config);

app.listen(config.PORT, () => {
  logger.info(`Fair Exchange AI Gateway listening on port ${config.PORT}`, {
    nodeEnv: config.NODE_ENV,
    exposeProviderInfo: config.GATEWAY_EXPOSE_PROVIDER_INFO,
  });
});
