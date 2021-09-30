/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import util from 'util';
import * as winston from 'winston';

const CONSOLE_LEVEL = process.env.CONSOLE_LEVEL || 'info';

const myFormat = winston.format.printf(
  ({ level, message, service, timestamp, ...args }) => {
    let argsStr = '';

    if (Object.keys(args).length > 0) {
      // Adapted from https://github.com/winstonjs/logform/blob/master/pretty-print.js
      const stripped = Object.assign({}, args);

      const levelSymbol = Symbol.for('level');
      const messageSymbol = Symbol.for('message');
      const splatSymbol = Symbol.for('splat');

      // Typing Symbol as any is a workaround for https://github.com/microsoft/TypeScript/issues/1863
      delete stripped[levelSymbol as any];
      delete stripped[messageSymbol as any];
      delete stripped[splatSymbol as any];

      argsStr = util.inspect(stripped, {
        compact: true,
        breakLength: Infinity,
      });
    }

    return `${timestamp} [${service}] ${level}: ${message} ${argsStr}`;
  }
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), myFormat),
    level: CONSOLE_LEVEL,
  }),
];

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  ),
  defaultMeta: { service: 'wallet-service-daemon' },
  transports: transports,
});

export default logger;
