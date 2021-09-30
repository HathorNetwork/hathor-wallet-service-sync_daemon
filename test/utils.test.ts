/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * @jest-environment node
 */
import {
  OUR_BEST_BLOCK_API_RESPONSE_VOIDED,
  OUR_BEST_BLOCK_API_RESPONSE,
  BLOCK_BY_HEIGHT,
  MOCK_TXS,
  MOCK_FULL_TXS,
  MOCK_NFT_TX,
  MOCK_CREATE_TOKEN_TX,
  generateBlock,
} from './utils';

import { FullTx } from '../src/types';
import { prepareTx, parseTx } from '../src/utils';
import * as Utils from '../src/utils';
import * as FullNode from '../src/api/fullnode';
import * as Lambda from '../src/api/lambda';
import axios from 'axios';
// @ts-ignore
import hathorLib from '@hathor/wallet-lib';
const { globalCache, syncToLatestBlock, LRU } = Utils;
const { downloadTx } = FullNode;

beforeEach(async () => {
  jest.clearAllMocks();
});

test('syncToLatestBlock should send transaction height for every block tx', async () => {
  expect.hasAssertions();

  const getFullNodeBestBlockSpy = jest.spyOn(FullNode, 'getFullNodeBestBlock');
  const getWalletServiceBestBlockSpy = jest.spyOn(
    Lambda,
    'getWalletServiceBestBlock'
  );
  const getBlockByTxIdSpy = jest.spyOn(FullNode, 'getBlockByTxId');
  const downloadBlockByHeightSpy = jest.spyOn(
    FullNode,
    'downloadBlockByHeight'
  );
  const recursivelyDownloadTxSpy = jest.spyOn(Utils, 'recursivelyDownloadTx');
  const sendTxSpy = jest.spyOn(Lambda, 'sendTx');

  getFullNodeBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[0], 1))
  );
  getWalletServiceBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[1], 0))
  );
  getBlockByTxIdSpy.mockReturnValue(
    Promise.resolve(OUR_BEST_BLOCK_API_RESPONSE)
  );
  downloadBlockByHeightSpy.mockReturnValue(Promise.resolve(BLOCK_BY_HEIGHT));
  recursivelyDownloadTxSpy.mockReturnValue(
    Promise.resolve(
      new Map<string, FullTx>([[MOCK_FULL_TXS[0].txId, MOCK_FULL_TXS[0]]])
    )
  );

  const mockSendTxImplementation = jest.fn(tx => {
    return Promise.resolve({
      success: true,
    });
  });

  const mockFn = sendTxSpy.mockImplementation(mockSendTxImplementation);
  const iterator = syncToLatestBlock();

  await iterator.next();

  expect(mockFn).toHaveBeenCalledWith(
    prepareTx({
      ...MOCK_FULL_TXS[0],
      height: BLOCK_BY_HEIGHT.height,
    })
  );
});

test('syncToLatestBlockGen should yield an error when the latest block from the wallet-service is_voided', async () => {
  expect.hasAssertions();

  const getFullNodeBestBlockSpy = jest.spyOn(FullNode, 'getFullNodeBestBlock');
  const getWalletServiceBestBlockSpy = jest.spyOn(
    Lambda,
    'getWalletServiceBestBlock'
  );
  const getBlockByTxIdSpy = jest.spyOn(FullNode, 'getBlockByTxId');
  const downloadBlockByHeightSpy = jest.spyOn(
    FullNode,
    'downloadBlockByHeight'
  );

  getFullNodeBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[0], 1))
  );
  getWalletServiceBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[1], 0))
  );
  getBlockByTxIdSpy.mockReturnValue(
    Promise.resolve(OUR_BEST_BLOCK_API_RESPONSE_VOIDED)
  );
  downloadBlockByHeightSpy.mockReturnValue(Promise.resolve(BLOCK_BY_HEIGHT));

  const iterator = syncToLatestBlock();

  const {
    value: { type, success, message },
  } = await iterator.next();

  expect(type).toStrictEqual('reorg');
  expect(success).toStrictEqual(false);
  expect(message).toStrictEqual('Our best block was voided, we should reorg.');
}, 500);

test("syncToLatestBlockGen should yield an error when our best block height is higher than the fullnode's", async () => {
  expect.hasAssertions();

  const getFullNodeBestBlockSpy = jest.spyOn(FullNode, 'getFullNodeBestBlock');
  const getWalletServiceBestBlockSpy = jest.spyOn(
    Lambda,
    'getWalletServiceBestBlock'
  );
  const getBlockByTxIdSpy = jest.spyOn(FullNode, 'getBlockByTxId');
  const downloadBlockByHeightSpy = jest.spyOn(
    FullNode,
    'downloadBlockByHeight'
  );

  getWalletServiceBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[1], 6))
  );
  getFullNodeBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[0], 3))
  );
  getBlockByTxIdSpy.mockReturnValue(
    Promise.resolve(OUR_BEST_BLOCK_API_RESPONSE_VOIDED)
  );
  downloadBlockByHeightSpy.mockReturnValue(Promise.resolve(BLOCK_BY_HEIGHT));

  const iterator = syncToLatestBlock();

  const {
    value: { type, success, message },
  } = await iterator.next();

  expect(type).toStrictEqual('reorg');
  expect(success).toStrictEqual(false);
  expect(message).toStrictEqual('Our best block was voided, we should reorg.');
}, 500);

test('syncToLatestBlockGen should yield an error when it fails to send a block', async () => {
  expect.hasAssertions();

  const getFullNodeBestBlockSpy = jest.spyOn(FullNode, 'getFullNodeBestBlock');
  const getWalletServiceBestBlockSpy = jest.spyOn(
    Lambda,
    'getWalletServiceBestBlock'
  );
  const getBlockByTxIdSpy = jest.spyOn(FullNode, 'getBlockByTxId');
  const sendTxSpy = jest.spyOn(Lambda, 'sendTx');
  const downloadBlockByHeightSpy = jest.spyOn(
    FullNode,
    'downloadBlockByHeight'
  );
  const recursivelyDownloadTxSpy = jest.spyOn(Utils, 'recursivelyDownloadTx');

  getWalletServiceBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[1], 3))
  );
  getFullNodeBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[0], 6))
  );
  getBlockByTxIdSpy.mockReturnValue(
    Promise.resolve(OUR_BEST_BLOCK_API_RESPONSE)
  );
  sendTxSpy.mockReturnValue(
    Promise.resolve({ success: false, message: 'generic error message' })
  );
  downloadBlockByHeightSpy.mockReturnValue(Promise.resolve(BLOCK_BY_HEIGHT));
  recursivelyDownloadTxSpy.mockReturnValue(
    Promise.resolve(new Map<string, FullTx>())
  );

  const iterator = syncToLatestBlock();

  const {
    value: { type, success, message },
  } = await iterator.next();

  expect(type).toStrictEqual('error');
  expect(success).toStrictEqual(false);
  expect(message).toStrictEqual(
    'Failure on block 0000000f1fbb4bd8a8e71735af832be210ac9a6c1e2081b21faeea3c0f5797f7'
  );
}, 500);

test('syncToLatestBlockGen should yield an error when it fails to send a transaction', async () => {
  expect.hasAssertions();

  const getFullNodeBestBlockSpy = jest.spyOn(FullNode, 'getFullNodeBestBlock');
  const getWalletServiceBestBlockSpy = jest.spyOn(
    Lambda,
    'getWalletServiceBestBlock'
  );
  const getBlockByTxIdSpy = jest.spyOn(FullNode, 'getBlockByTxId');
  const sendTxSpy = jest.spyOn(Lambda, 'sendTx');
  const downloadBlockByHeightSpy = jest.spyOn(
    FullNode,
    'downloadBlockByHeight'
  );
  const recursivelyDownloadTxSpy = jest.spyOn(Utils, 'recursivelyDownloadTx');

  getWalletServiceBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[1], 3))
  );
  getFullNodeBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[0], 6))
  );
  getBlockByTxIdSpy.mockReturnValue(
    Promise.resolve(OUR_BEST_BLOCK_API_RESPONSE)
  );
  // sendTxSpy.mockReturnValue(Promise.resolve({ success: false, message: 'generic error message' }));
  downloadBlockByHeightSpy.mockReturnValue(Promise.resolve(BLOCK_BY_HEIGHT));
  recursivelyDownloadTxSpy.mockReturnValue(
    Promise.resolve(
      new Map<string, FullTx>([
        [MOCK_FULL_TXS[0].txId as string, MOCK_FULL_TXS[0] as FullTx],
      ])
    )
  );

  const mockSendTxImplementation = jest.fn(tx => {
    if (hathorLib.helpers.isBlock(tx)) {
      // is block
      return Promise.resolve({
        success: true,
      });
    }

    // is tx
    return Promise.resolve({
      success: false,
      message: 'generic send tx error message',
    });
  });

  sendTxSpy.mockImplementation(mockSendTxImplementation);

  const iterator = syncToLatestBlock();

  const {
    value: { type, success, message },
  } = await iterator.next();

  expect(type).toStrictEqual('transaction_failure');
  expect(success).toStrictEqual(false);
  expect(message).toStrictEqual(
    'Failure on transaction 0000000033a3bb347e0401d85a70b38f0aa7b5e37ea4c70d7dacf8e493946e64 from block: 0000000f1fbb4bd8a8e71735af832be210ac9a6c1e2081b21faeea3c0f5797f7'
  );
}, 500);

test('syncToLatestBlockGen should sync from our current height until the best block height', async () => {
  expect.hasAssertions();

  const getFullNodeBestBlockSpy = jest.spyOn(FullNode, 'getFullNodeBestBlock');
  const getWalletServiceBestBlockSpy = jest.spyOn(
    Lambda,
    'getWalletServiceBestBlock'
  );
  const getBlockByTxIdSpy = jest.spyOn(FullNode, 'getBlockByTxId');
  const sendTxSpy = jest.spyOn(Lambda, 'sendTx');
  const downloadBlockByHeightSpy = jest.spyOn(
    FullNode,
    'downloadBlockByHeight'
  );
  const recursivelyDownloadTxSpy = jest.spyOn(Utils, 'recursivelyDownloadTx');

  getWalletServiceBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[1], 1))
  );
  getFullNodeBestBlockSpy.mockReturnValue(
    Promise.resolve(generateBlock(MOCK_TXS[0], 3))
  );
  getBlockByTxIdSpy.mockReturnValue(
    Promise.resolve(OUR_BEST_BLOCK_API_RESPONSE)
  );
  sendTxSpy.mockReturnValue(Promise.resolve({ success: true, message: 'ok' }));
  recursivelyDownloadTxSpy.mockReturnValue(
    Promise.resolve(new Map<string, FullTx>())
  );

  const mockBlockHeightImplementation = jest.fn((height: number) => {
    return Promise.resolve({
      ...BLOCK_BY_HEIGHT,
      height,
    });
  });

  downloadBlockByHeightSpy.mockImplementationOnce(
    mockBlockHeightImplementation
  );

  const iterator = syncToLatestBlock();

  const y1 = await iterator.next();
  expect(y1.value.success).toStrictEqual(true);
  expect(y1.value.height).toStrictEqual(2);
  expect(y1.value.type).toStrictEqual('block_success');

  const y2 = await iterator.next();
  expect(y2.value.success).toStrictEqual(true);
  expect(y2.value.height).toStrictEqual(3);
  expect(y2.value.type).toStrictEqual('block_success');

  const { value } = await iterator.next();
  expect(value.success).toStrictEqual(true);
  expect(value.type).toStrictEqual('finished');
}, 500);

test('Dowload tx should cache transactions', async () => {
  expect.hasAssertions();

  const axiosGetSpy = jest.spyOn(axios, 'get');

  const mockAxiosGetImplementation = jest.fn(url => {
    const [_, txId] = url.split('=');
    // is tx
    return Promise.resolve({
      success: true,
      data: {
        tx_id: txId,
      },
    });
  });

  axiosGetSpy.mockImplementation(mockAxiosGetImplementation);

  await downloadTx('tx1');

  const cachedTx = globalCache.get('tx1');

  expect(cachedTx).toStrictEqual({ tx_id: 'tx1' });
}, 500);

test('LRU cache', async () => {
  expect.hasAssertions();

  const cache = new LRU(3);

  cache.set('tx1', { tx_id: 'tx1' });
  cache.set('tx2', { tx_id: 'tx2' });
  cache.set('tx3', { tx_id: 'tx3' });

  expect(cache.first()).toStrictEqual('tx1');

  expect(cache.get('tx1')).toStrictEqual({ tx_id: 'tx1' });
  expect(cache.get('tx2')).toStrictEqual({ tx_id: 'tx2' });
  expect(cache.get('tx3')).toStrictEqual({ tx_id: 'tx3' });

  cache.set('tx4', { tx_id: 'tx4' });

  expect(cache.get('tx1')).toStrictEqual(undefined);
  expect(cache.first()).toStrictEqual('tx2');

  cache.set('tx5', { tx_id: 'tx5' });

  expect(cache.get('tx2')).toStrictEqual(undefined);
  expect(cache.first()).toStrictEqual('tx3');

  cache.set('tx6', { tx_id: 'tx6' });

  expect(cache.get('tx3')).toStrictEqual(undefined);
  expect(cache.first()).toStrictEqual('tx4');
}, 500);

test('prepareTx on a CREATE_TOKEN tx should have token_name and token_symbol', async () => {
  expect.hasAssertions();

  const { tx } = MOCK_CREATE_TOKEN_TX;
  const parsedTx = parseTx(tx);
  const preparedTx = prepareTx(parsedTx);

  expect(preparedTx.token_name).toStrictEqual('XCoin');
  expect(preparedTx.token_symbol).toStrictEqual('XCN');
}, 500);

test('prepareTx on a NFT transaction should not throw', async () => {
  expect.hasAssertions();

  const { tx } = MOCK_NFT_TX;
  const parsedTx = parseTx(tx);
  const preparedTx = prepareTx(parsedTx);

  expect(preparedTx.outputs[0].decoded.type).toStrictEqual(undefined);
  expect(preparedTx.outputs[0].value).toStrictEqual(1);
  expect(preparedTx.outputs[0].token_data).toStrictEqual(0);
}, 500);
