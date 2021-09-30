/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * @jest-environment node
 */

import { interpret } from 'xstate';
import { SyncMachine } from '../src/machine';

beforeAll(async () => {
  jest.clearAllMocks();
});

test('SyncMachine should start as idle', async () => {
  // @ts-ignore
  const syncMachine = interpret(SyncMachine).start();

  expect(syncMachine.state.value).toStrictEqual('idle');
}, 100);

test("An idle SyncMachine should transition to 'syncing' when a NEW_BLOCK action is received", async () => {
  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return () => {};
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');
}, 500);

test("A SyncMachine in the syncing state should transition to 'failure' when an ERROR event is received", async () => {
  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return () => {};
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'ERROR' });

  expect(syncMachine.state.value).toStrictEqual('failure');
}, 500);

test('A SyncMachine in the syncing state should store hasMoreBlocks on context if a NEW_BLOCK event is received', async () => {
  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return () => {};
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(true);
}, 500);

test("A SyncMachine should transition to 'idle' when it is on 'syncing' state and received 'DONE'", async () => {
  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return () => {};
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'DONE' });

  expect(syncMachine.state.value).toStrictEqual('idle');
}, 500);

test("A SyncMachine should transition to 'syncing' if hasMoreBlocks context is true on IDLE state entry", async () => {
  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return () => {};
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(true);

  syncMachine.send({ type: 'DONE' });

  expect(syncMachine.state.value).toStrictEqual('syncing');
}, 500);

test("A SyncMachine should clear hasMoreBlocks from context when transitioning to 'syncing'", async () => {
  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return () => {};
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(true);

  syncMachine.send({ type: 'DONE' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);
}, 500);

test('A SyncMachine should call the cleanupFn on the syncHandler service when state is transitioned out of syncing', async () => {
  const mockCleanupFunction = jest.fn();

  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return mockCleanupFunction;
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  expect(mockCleanupFunction).toHaveBeenCalledTimes(0);

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'DONE' });

  expect(mockCleanupFunction).toHaveBeenCalledTimes(1);

  expect(syncMachine.state.value).toStrictEqual('idle');

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'STOP' });

  expect(mockCleanupFunction).toHaveBeenCalledTimes(2);

  expect(syncMachine.state.value).toStrictEqual('idle');

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'ERROR' });

  expect(syncMachine.state.value).toStrictEqual('failure');

  expect(mockCleanupFunction).toHaveBeenCalledTimes(3);
}, 500);

test("The SyncMachine should transition to 'reorg' state when a reorg is detected", async () => {
  const mockCleanupFunction = jest.fn();

  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return mockCleanupFunction;
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  expect(mockCleanupFunction).toHaveBeenCalledTimes(0);

  expect(syncMachine.state.context.hasMoreBlocks).toStrictEqual(false);

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  syncMachine.send({ type: 'REORG' });

  expect(syncMachine.state.value).toStrictEqual('reorg');
}, 500);

test("Mempool: transition to 'idle' on ERROR event", async () => {
  const mockCleanupFunction = jest.fn();

  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return mockCleanupFunction;
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  syncMachine.send({ type: 'MEMPOOL_UPDATE' });

  expect(syncMachine.state.value).toStrictEqual('mempoolsync');

  syncMachine.send({ type: 'ERROR' });

  expect(syncMachine.state.value).toStrictEqual('idle');
}, 500);

test("Mempool: transition to 'idle' on DONE event", async () => {
  const mockCleanupFunction = jest.fn();

  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return mockCleanupFunction;
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  syncMachine.send({ type: 'MEMPOOL_UPDATE' });

  expect(syncMachine.state.value).toStrictEqual('mempoolsync');

  syncMachine.send({ type: 'DONE' });

  expect(syncMachine.state.value).toStrictEqual('idle');
}, 500);

test("Mempool: transition to 'idle' on STOP event", async () => {
  const mockCleanupFunction = jest.fn();

  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return mockCleanupFunction;
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  syncMachine.send({ type: 'MEMPOOL_UPDATE' });

  expect(syncMachine.state.value).toStrictEqual('mempoolsync');

  syncMachine.send({ type: 'STOP' });

  expect(syncMachine.state.value).toStrictEqual('idle');
}, 500);

test("Mempool: transition to 'syncing' on NEW_BLOCK event and back to 'mempoolsync' when DONE with block sync", async () => {
  const mockCleanupFunction = jest.fn();

  const TestSyncMachine = SyncMachine.withConfig({
    services: {
      syncHandler: () => () => {
        return mockCleanupFunction;
      },
    },
  });

  // @ts-ignore
  const syncMachine = interpret(TestSyncMachine).start();

  syncMachine.send({ type: 'MEMPOOL_UPDATE' });

  expect(syncMachine.state.value).toStrictEqual('mempoolsync');

  syncMachine.send({ type: 'NEW_BLOCK' });

  expect(syncMachine.state.value).toStrictEqual('syncing');

  expect(syncMachine.state.context.hasMempoolUpdate).toStrictEqual(true);

  syncMachine.send({ type: 'DONE' });

  // Will go to idle and straight back to mempoolsync, setting hasMempoolUpdate to false
  expect(syncMachine.state.context.hasMempoolUpdate).toStrictEqual(false);
  expect(syncMachine.state.value).toStrictEqual('mempoolsync');
}, 500);
