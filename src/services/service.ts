import * as bunyan from "bunyan";
import * as fs from "fs";
import * as os from "os";

import { config } from "../config";

export const NODE_ENV = (process.env.NODE_ENV || "production").toLowerCase();

export const appName = "federated";
if (config.logger && config.logger.path && !fs.existsSync(config.logger.path)) {
  fs.mkdirSync(config.logger.path);
}
const serializers = {
  req: req => {
    if (!req || !req.connection) {
      return req;
    }
    return {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      remoteAddress: req.connection.remoteAddress,
      remotePort: req.connection.remotePort
    };
  },
  res: bunyan.stdSerializers.res,
  err: bunyan.stdSerializers.err
};

export const logger = bunyan.createLogger(
  (config.logger && config.logger.path) ? {
    name: appName,
    serializers,
    streams: [{
      type: "rotating-file",
      ...config.logger,
      path: `${process.env.LOGGER_PATH || config.logger.path || "."}/${appName}-${os.hostname()}.log`,
    }]
  } : { name: appName, serializers });
