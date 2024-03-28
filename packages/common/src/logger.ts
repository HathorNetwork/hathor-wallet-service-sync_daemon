/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createLogger, format, transports, Logger } from 'winston';

const createDefaultLogger = (): Logger => createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.json(),
  transports: [
    new transports.Console(),
  ],
});

export default createDefaultLogger;
