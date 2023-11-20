/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Context, Event, EventTypes } from '../types';
import { hashTxData } from '../utils';
import { METADATA_DIFF_EVENT_TYPES } from '../services';
import getConfig from '../config';

/*
 * This guard is used during the `handlingMetadataChanged` to check if
 * the result was an IGNORE event
 */
export const metadataIgnore = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.METADATA_DECIDED) {
    throw new Error(`Invalid event type on metadataIgnore guard: ${event.type}`);
  }

  return event.event.type === METADATA_DIFF_EVENT_TYPES.IGNORE;
};

/*
 * This guard is used during the `handlingMetadataChanged` to check if
 * the result was a TX_VOIDED event
 */
export const metadataVoided = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.METADATA_DECIDED) {
    throw new Error(`Invalid event type on metadataVoided guard: ${event.type}`);
  }

  return event.event.type === METADATA_DIFF_EVENT_TYPES.TX_VOIDED;
};

/*
 * This guard is used during the `handlingMetadataChanged` to check if
 * the result was a TX_UNVOIDED event, which means the tx was voided
 * and then got unvoided
 */
export const metadataUnvoided = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.METADATA_DECIDED) {
    throw new Error(`Invalid event type on metadataUnvoided guard: ${event.type}`);
  }

  return event.event.type === METADATA_DIFF_EVENT_TYPES.TX_UNVOIDED;
};

/*
 * This guard is used during the `handlingMetadataChanged` to check if
 * the result was a TX_NEW event, which means that we should insert
 * this transaction on the database
 */
export const metadataNewTx = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.METADATA_DECIDED) {
    throw new Error(`Invalid event type on metadataNewTx guard: ${event.type}`);
  }

  return event.event.type === METADATA_DIFF_EVENT_TYPES.TX_NEW;
};

/*
 * This guard is used during the `handlingMetadataChanged` to check if
 * the result was a TX_FIRST_BLOCK event, which means that we should insert
 * the height of this transaction to the database
 */
export const metadataFirstBlock = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.METADATA_DECIDED) {
    throw new Error(`Invalid event type on metadataFirstBlock guard: ${event.type}`);
  }

  return event.event.type === METADATA_DIFF_EVENT_TYPES.TX_FIRST_BLOCK;
};

/*
 * This guard is used on the `idle` state when an event is received
 * from the fullnode to detect if this event is a VERTEX_METADATA_CHANGED
 * event
 */
export const metadataChanged = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.FULLNODE_EVENT) {
    throw new Error(`Invalid event type on metadataChanged guard: ${event.type}`);
  }

  return event.event.event.type === 'VERTEX_METADATA_CHANGED';
};

/*
 * This guard is used on the `idle` state when an event is received
 * from the fullnode to detect if this event is a NEW_VERTEX_ACCEPTED
 * event
 */
export const vertexAccepted = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.FULLNODE_EVENT) {
    throw new Error(`Invalid event type on vertexAccepted guard: ${event.type}`);
  }

  return event.event.event.type === 'NEW_VERTEX_ACCEPTED';
};

/*
 * This guard is used on each event that is received from the fullnode to detect
 * if the received peer_id is the same as we expect (from an env var)
 */
export const invalidPeerId = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.FULLNODE_EVENT) {
    throw new Error(`Invalid event type on invalidPeerId guard: ${event.type}`);
  }
  const { FULLNODE_PEER_ID } = getConfig();

  // @ts-ignore
  return event.event.peer_id !== FULLNODE_PEER_ID;
};

/*
 * This guard is used on each event that is received from the fullnode to detect
 * if the received network is the same as we expect (from an env var)
 */
export const invalidNetwork = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.FULLNODE_EVENT) {
    throw new Error(`Invalid event type on invalidNetwork guard: ${event.type}`);
  }
  const { NETWORK } = getConfig();

  return event.event.network !== NETWORK;
};

/*
 * This guard is used on each event that is received from the fullnode to detect
 * if the received stream_id is the same as we expect (from an env var).
 * This makes sure that the order of the events is the same.
 */
export const invalidStreamId = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.FULLNODE_EVENT) {
    throw new Error(`Invalid event type on invalidStreamId guard: ${event.type}`);
  }
  const { STREAM_ID } = getConfig();

  return event.event.stream_id !== STREAM_ID;
}

export const websocketDisconnected = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.WEBSOCKET_EVENT) {
    throw new Error(`Invalid event type on websocketDisconnected guard: ${event.type}`);
  }

  if (event.event.type === 'DISCONNECTED') {
    return true;
  }

  return false;
};

/*
 * This guard is used in the `idle` state to detect if the transaction in the
 * received event is voided, this can serve many functions, one of them is to
 * ignore transactions that we don't have on our database but are already voided
 */
export const voided = (_context: Context, event: Event) => {
  if (event.type !== EventTypes.FULLNODE_EVENT) {
    throw new Error(`Invalid event type on voided guard: ${event.type}`);
  }

  if (event.event.event.type !== 'VERTEX_METADATA_CHANGED'
      && event.event.event.type !== 'NEW_VERTEX_ACCEPTED') {
        return false;
  }

  const fullNodeEvent = event.event.event;
  const { metadata: { voided_by } } = fullNodeEvent.data;

  return voided_by.length > 0;
};

/*
 * This guard is used to check our transaction cache to see if any of the fields
 * we monitor are changed.
 *
 * The idea is to ignore, without querying the database, events that don't change
 * any of the fields we are interested on
 */
export const unchanged = (context: Context, event: Event) => {
  if (event.type !== EventTypes.FULLNODE_EVENT) {
    throw new Error(`Invalid event type on unchanged guard: ${event.type}`);
  }

  if (event.event.event.type !== 'VERTEX_METADATA_CHANGED'
      && event.event.event.type !== 'NEW_VERTEX_ACCEPTED') {

    // Not unchanged
    return false;
  }

  const { data } = event.event.event;

  const txCache = context.txCache;
  const txHashFromCache = txCache.get(data.hash);
  // Not on the cache, it's not unchanged.
  if (!txHashFromCache) {
    return false;
  }

  const txHashFromEvent = hashTxData(data.metadata);

  return txHashFromCache === txHashFromEvent;
};
