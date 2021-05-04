/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Machine,
  assign,
  send,
} from 'xstate';
import { syncToLatestBlock } from './utils';
import {
  SyncSchema,
  SyncContext,
} from './types';
import logger from './logger';

export const syncHandler = (_context, _event) => (callback, onReceive) => {
  logger.debug('Sync handler instantiated');
  const iterator = syncToLatestBlock();
  const asyncCall: () => void = async () => {
    for (;;) {
      const block = await iterator.next();
      const { value, done } = block;

      if (done) {
        // The generator reached its end, we should end this handler
        logger.debug('Done.', value)
        break;
      }

      if (value && !value.success) {
        logger.error(value.message);
        callback('ERROR');
        return;
      }

      if (value.type === 'reorg') {
        logger.info('A reorg happened: ', value.message);
        callback('REORG');
        return;
      } else if (value.type === 'finished') {
        logger.info('Sync generator finished.');
        callback('DONE');
      } else if (value.type === 'block_success') {
        logger.info(`Block id: ${value.blockId} sent successfully, transactions sent: ${value.transactions.length}`);
      } else {
        logger.warn(`Unhandled type received from sync generator: ${value.type}`);
      }
    }

    return;
  };


  onReceive((e) => {
    if (e.type === 'START') {
      asyncCall();
    }
  });

  return () => {
    logger.debug('Stopping the iterator.');
    iterator.return('finished');

    return;
  };
};

/* See README for an explanation on how the machine works.
 * TODO: We need to type the Event
 */
export const SyncMachine = Machine<SyncContext, SyncSchema, any>({
  id: 'sync',
  initial: 'idle',
  context: {
    hasMoreBlocks: false,
  },
  states: {
    idle: {
      always: [
        { target: 'syncing', cond: 'hasMoreBlocks' },
      ],
      on: { NEW_BLOCK: 'syncing' },
    },
    syncing: {
      invoke: {
        id: 'syncToLatestBlock',
        src: 'syncHandler',
      },
      on: {
        NEW_BLOCK: {
          actions: ['setMoreBlocks'],
        },
        STOP: 'idle',
        DONE: 'idle',
        ERROR: 'failure',
        REORG: 'reorg',
      },
      entry: [
        'resetMoreBlocks',
        send('START', {
          to: 'syncToLatestBlock',
        }),
      ],
    },
    reorg: {
      type: 'final',
    },
    failure: {
      type: 'final',
    },
  }
}, {
  guards: {
    hasMoreBlocks: (ctx) => ctx.hasMoreBlocks,
  },
  actions: {
    resetMoreBlocks: assign({
      hasMoreBlocks: () => false,
    }),
    setMoreBlocks: assign({
      hasMoreBlocks: () => true,
    }),
  },
  services: {
    syncHandler,
  },
});
