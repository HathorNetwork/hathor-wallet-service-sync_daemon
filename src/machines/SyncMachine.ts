/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Machine, assign } from 'xstate';
import {
  Context,
  Event,
} from './types';

const RETRY_BACKOFF_INCREASE = 1000; // 1s increase in the backoff strategy
const MAX_BACKOFF_RETRIES = 10; // The retry backoff will top at 10s

const SyncMachine = Machine<Context, any, Event>({
  id: 'websocket',
  initial: 'CONNECTING',
  context: {
    socket: null,
    retryAttempt: 0,
  },
  states: {
    CONNECTING: {
      invoke: {
        src: 'initializeWebSocket',
        onDone: 'CONNECTED',
        onError: 'RECONNECTING',
      },
    },
    RECONNECTING: {
      onEntry: ['clearSocket'],
      after: {
        RETRY_BACKOFF_INCREASE: 'CONNECTING',
      },
    },
    CONNECTED: {
      invoke: {
        src: 'validateNetwork',
        onDone: 'CONNECTED.idle',
        onError: 'ERROR',
      },
      initial: 'validating',
      states: {
        validating: {},
        idle: {
          on: {
            'FULLNODE_EVENT': [{
              cond: 'invalidPeerId',
              target: '#final-error',
            }, {
              target: 'handlingMessage',
            }],
          },
        },
        handlingMessage: {},
      },
      on: {
        'WEBSOCKET_EVENT': [{
          cond: (_context, event: Event) => {
            if (event.type === 'WEBSOCKET_EVENT'
                && event.event.type === 'DISCONNECTED') {
              return true;
            }

            return false;
          },
          target: 'RECONNECTING',
        }]
      }
    },
    ERROR: {
      id: 'final-error',
      type: 'final',
    }
  },
}, {
  guards: {
    invalidPeerId: () => false,
  },
  delays: {
    BACKOFF_DELAYED_RECONNECT: (context: Context) => {
      if (context.retryAttempt > MAX_BACKOFF_RETRIES) {
        return MAX_BACKOFF_RETRIES * RETRY_BACKOFF_INCREASE;
      }

      return context.retryAttempt * RETRY_BACKOFF_INCREASE;
    },
  },
  actions: {
    clearSocket: assign({
      socket: null,
    }),
  }, 
  services: {
    initializeWebSocket: async (_context: Context, _event: Event) => {
      return Promise.resolve();
    },
    validateNetwork: async (_context: Context, _event: Event) => {
      // Here we should request the fullnode API to get the network and
      // validate it.
      return Promise.resolve();
    },
  },
});

export default SyncMachine;
