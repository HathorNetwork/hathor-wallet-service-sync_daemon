/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Machine, assign, send } from 'xstate';
import { syncToLatestBlock, syncLatestMempool } from './utils';
import {
  GeneratorYieldResult,
  HandlerEvent,
  StatusEvent,
  MempoolEvent,
  SyncContext,
  SyncSchema,
} from './types';
import logger from './logger';
import { invokeReorg } from './api/lambda';

// @ts-ignore
export const syncHandler = () => (callback, onReceive) => {
  logger.debug('Sync handler instantiated');
  const iterator = syncToLatestBlock();
  const asyncCall: () => void = async () => {
    for (;;) {
      const block: GeneratorYieldResult<StatusEvent> = await iterator.next();
      const { value, done } = block;

      if (done) {
        // The generator reached its end, we should end this handler
        logger.debug('Done.', value);
        break;
      }

      if (value && !value.success) {
        if (value.type === 'reorg') {
          logger.warn('A reorg happened: ', value.message);
          callback('REORG');
          return;
        }

        logger.error(value.message);
        callback('ERROR');
        return;
      }

      if (value.type === 'finished') {
        logger.info('Sync generator finished.');
        callback('DONE');
      } else if (value.type === 'block_success') {
        logger.info(
          `Block id: ${value.blockId} sent successfully, transactions sent: ${value.transactions.length}`
        );
      } else {
        logger.warn(
          `Unhandled type received from sync generator: ${value.type}`
        );
      }
    }

    return;
  };

  /* onReceive is used for bi-directional communication between the
   * machine and the invoked service (syncHandler).
   *
   * For now, the only message we are handling is the start event, to indicate
   * that we should start the async promise dealing with the generator.
   */
  onReceive((e: HandlerEvent) => {
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

// @ts-ignore
export const mempoolHandler = () => (callback, onReceive) => {
  logger.debug('Mempool handler instantiated');
  const iterator = syncLatestMempool();
  const asyncCall: () => void = async () => {
    for (;;) {
      const txResult: GeneratorYieldResult<MempoolEvent> = await iterator.next();
      const { value, done } = txResult;

      if (done) {
        // The generator reached its end, we should end this handler
        logger.debug('Done.', value);
        break;
      }

      if (value && !value.success) {
        logger.error(value.message);
        callback('ERROR');
        return;
      }

      if (value.type === 'finished') {
        logger.info('Sync generator finished.');
        callback('DONE');
        return;
      } else if (value.type === 'tx_success') {
        logger.info('Mempool tx synced!');
      } else {
        logger.warn(
          `Unhandled type received from sync generator: ${value.type}`
        );
      }
    }

    return;
  };

  onReceive((e: HandlerEvent) => {
    if (e.type === 'START') {
      asyncCall();
    }
  });

  return () => {
    logger.debug('Stopping the iterator.');
    iterator.return('finished');
  };
};

/* See README for an explanation on how the machine works.
 * TODO: We need to type the Event
 */
export const SyncMachine = Machine<SyncContext, SyncSchema>(
  {
    id: 'sync',
    initial: 'idle',
    context: {
      hasMoreBlocks: false,
      hasMempoolUpdate: false,
    },
    states: {
      idle: {
        always: [
          // Conditions are tested in order, the first valid one is taken, if any are valid
          // https://xstate.js.org/docs/guides/guards.html#multiple-guards
          { target: 'syncing', cond: 'hasMoreBlocks' },
          { target: 'mempoolsync', cond: 'hasMempoolUpdate' },
        ],
        on: {
          NEW_BLOCK: 'syncing',
          MEMPOOL_UPDATE: 'mempoolsync',
        },
      },
      mempoolsync: {
        invoke: {
          id: 'syncLatestMempool',
          src: 'mempoolHandler',
        },
        on: {
          MEMPOOL_UPDATE: {
            actions: ['setMempoolUpdate'],
          },
          // Stop mempool sync when a block arrives
          // this means that the mempool may not be fully synced when it leaves this state
          // giving priority to blocks means the mempool may change between syncs
          NEW_BLOCK: {
            target: 'syncing',
            // When block sync finishes, go back to mempool sync
            actions: ['setMempoolUpdate'],
          },
          STOP: 'idle',
          DONE: 'idle',
          // Errors on mempool sync are "ignored" since next sync (either block or mempool) should fix it
          ERROR: 'idle',
        },
        entry: [
          'resetMempoolUpdate',
          send('START', {
            to: 'syncLatestMempool',
          }),
        ],
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
        invoke: {
          id: 'invokeReorg',
          src: (_context, _event) => async () => {
            const response = await invokeReorg();

            if (!response.success) {
              logger.error(response);
              throw new Error('Reorg failed');
            }

            return;
          },
          onDone: {
            target: 'idle',
          },
          onError: {
            target: 'failure',
          },
        },
      },
      failure: {
        type: 'final',
        entry: ['logFailure'],
      },
    },
  },
  {
    guards: {
      hasMoreBlocks: ctx => ctx.hasMoreBlocks,
      hasMempoolUpdate: ctx => ctx.hasMempoolUpdate,
    },
    actions: {
      // @ts-ignore
      logFailure: () => {
        logger.error('[ALERT] Machine transitioned to failure state.');
      },
      // @ts-ignore
      resetMoreBlocks: assign({
        hasMoreBlocks: () => false,
      }),
      // @ts-ignore
      setMoreBlocks: assign({
        hasMoreBlocks: () => true,
      }),
      // @ts-ignore
      resetMempoolUpdate: assign({
        hasMempoolUpdate: () => false,
      }),
      // @ts-ignore
      setMempoolUpdate: assign({
        hasMempoolUpdate: () => true,
      }),
    },
    services: {
      syncHandler,
      mempoolHandler,
    },
  }
);
