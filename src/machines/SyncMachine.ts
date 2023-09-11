/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Machine,
  assign,
  spawn,
  actions,
  AssignAction,
} from 'xstate';
import { hashTxData, LRU } from '../utils';
import { WebSocketActor } from '../actors';
import {
  Context,
  Event,
} from './types';

const RETRY_BACKOFF_INCREASE = 1000; // 1s increase in the backoff strategy
const MAX_BACKOFF_RETRIES = 10; // The retry backoff will top at 10s

export const TxCache = new LRU(10000);

const storeEvent: AssignAction<Context, Event> = assign({
  // @ts-ignore
  lastEventId: (context: Context, event: Event) => {
    if (event.type !== 'FULLNODE_EVENT') {
      return context.lastEventId;
    }
    if (!('id' in event.event.event)) return;

    return event.event.event.id;
  },
});

const SyncMachine = Machine<Context, any, Event>({
  id: 'websocket',
  initial: 'CONNECTING',
  context: {
    socket: null,
    retryAttempt: 0,
    lastEventId: null,
  },
  states: {
    CONNECTING: {
      entry: assign({
        socket: () => spawn(WebSocketActor),
      }),
      on: {
        'WEBSOCKET_EVENT': [{
          cond: 'websocketDisconnected',
          target: 'RECONNECTING',
        }, {
          target: 'CONNECTED',
        }],
      }
    },
    RECONNECTING: {
      onEntry: ['clearSocket'],
      after: {
        RETRY_BACKOFF_INCREASE: 'CONNECTING',
      },
    },
    CONNECTED: {
      initial: 'validateNetwork',
      states: {
        validateNetwork: {
          invoke: {
            src: 'validateNetwork',
            onDone: 'idle',
            onError: '#final-error',
          },
        },
        idle: {
          on: {
            FULLNODE_EVENT: [{
              cond: 'invalidPeerId',
              target: '#final-error',
            }, {
              actions: ['storeEvent', 'sendAck'],
              cond: 'unchanged',
              target: 'idle',
            }, {
              actions: ['storeEvent', 'sendAck'],
              cond: 'metadataChanged',
              target: 'handlingMetadataChanged',
            }, {
              actions: ['storeEvent', 'sendAck'],
              cond: 'vertexAccepted',
              target: 'handlingVertexAccepted',
            }, {
              actions: ['storeEvent', 'sendAck'],
              target: 'idle',
            }],
          },
        },
        handlingVoidedTx: {
          id: 'handlingVoidedTx',
        },
        handlingNewTx: {
          id: 'handlingNewTx',
        },
        handlingFirstBlock: {
          id: 'handlingFirstBlock',
        },
        handlingMetadataChanged: {
          initial: 'detectingDiff',
          states: {
            detectingDiff: {
              invoke: {
                src: 'metadataDiff',
              },
              on: {
                'METADATA_DECIDED': [
                  { target: '#handlingVoidedTx', cond: 'metadataVoided' },
                  { target: '#handlingNewTx', cond: 'metadataNewTx' },
                  { target: '#handlingFirstBlock', cond: 'metadataFirstBlock' },
                ],
              }
            },
          }
        },
        // We have the unchanged guard, so it's guaranteed that this is a new tx
        handlingVertexAccepted: {},
      },
      on: {
        'WEBSOCKET_EVENT': [{
          cond: 'websocketDisconnected',
          target: 'RECONNECTING',
        }],
      }
    },
    ERROR: {
      id: 'final-error',
      type: 'final',
    }
  },
}, {
  guards: {
    metadataVoided: (_context, event: Event) => {
      if (event.type !== 'METADATA_DECIDED') {
        return false;
      }

      return event.event.type === 'TX_VOIDED';
    },
    metadataNewTx: (_context, event: Event) => {
      if (event.type !== 'METADATA_DECIDED') {
        return false;
      }

      return event.event.type === 'TX_NEW';
    },
    metadataFirstBlock: (_context, event: Event) => {
      if (event.type !== 'METADATA_DECIDED') {
        return false;
      }

      return event.event.type === 'TX_FIRST_BLOCK';
    },
    metadataChanged: (_context, event: Event) => {
      if (event.type !== 'FULLNODE_EVENT') {
        return false;
      }

      return event.event.event.type === 'VERTEX_METADATA_CHANGED';
    },
    vertexAccepted: (_context, event: Event) => {
      if (event.type !== 'FULLNODE_EVENT') {
        return false;
      }

      return event.event.event.type === 'NEW_VERTEX_ACCEPTED';
    },
    invalidPeerId: () => {
      return false;
    },
    websocketDisconnected: (_context, event: Event) => {
      if (event.type === 'WEBSOCKET_EVENT'
          && event.event.type === 'DISCONNECTED') {
        return true;
      }

      return false;
    },
    unchanged: (_context: Context, event: Event) => {
      if (event.type !== 'FULLNODE_EVENT') {
        return true;
      }

      const { data } = event.event.event;

      const txHashFromCache = TxCache.get(data.hash);
      // Not on the cache, it's not unchanged.
      if (!txHashFromCache) {
        return false;
      }

      const txHashFromEvent = hashTxData(data.metadata);

      return txHashFromCache === txHashFromEvent;
    },
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
    storeEvent,
    sendAck: () => {},
  }, 
  services: {
    metadataDiff: async (_context: Context, event: Event) => {
      // Here we should go on the database to detect what changed!
      actions.respond('METADATA_DECIDED', {
        // @ts-ignore
        type: 'TX_VOIDED',
        originalEvent: event,
      });
    },
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
