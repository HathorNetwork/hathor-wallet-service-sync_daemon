/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Block,
  ApiResponse,
  FullBlock,
  Input,
  Output,
  DecodedScript,
  FullTx,
  StatusEvent,
  MempoolEvent,
  PreparedTx,
  PreparedInput,
  PreparedOutput,
  PreparedDecodedScript,
  RawTxResponse,
  RawTx,
  RawInput,
  RawOutput,
} from './types';
import {
  downloadTx,
  downloadMempool,
  getBlockByTxId,
  getFullNodeBestBlock,
  downloadBlockByHeight,
} from './api/fullnode';
import { getWalletServiceBestBlock, sendTx } from './api/lambda';
import dotenv from 'dotenv';
// @ts-ignore
import { wallet } from '@hathor/wallet-lib';
import logger from './logger';
import { isNumber, isEmpty } from 'lodash';

dotenv.config();

export const IGNORE_TXS: Map<string, string[]> = new Map<string, string[]>([
  [
    'mainnet',
    [
      '000006cb93385b8b87a545a1cbb6197e6caff600c12cc12fc54250d39c8088fc',
      '0002d4d2a15def7604688e1878ab681142a7b155cbe52a6b4e031250ae96db0a',
      '0002ad8d1519daaddc8e1a37b14aac0b045129c01832281fb1c02d873c7abbf9',
    ],
  ],
  [
    'testnet',
    [
      '0000033139d08176d1051fb3a272c3610457f0c7f686afbe0afe3d37f966db85',
      '00e161a6b0bee1781ea9300680913fb76fd0fac4acab527cd9626cc1514abdc9',
      '00975897028ceb037307327c953f5e7ad4d3f42402d71bd3d11ecb63ac39f01a',
    ],
  ],
]);

const TX_CACHE_SIZE: number =
  parseInt(process.env.TX_CACHE_SIZE as string) || 200;

/**
 * Download and parse a tx by it's id
 *
 * @param txId - the id of the tx to be downloaded
 */
export const downloadTxFromId = async (
  txId: string
): Promise<FullTx | null> => {
  const network: string = process.env.NETWORK || 'mainnet';

  // Do not download genesis transactions
  if (IGNORE_TXS.has(network)) {
    const networkTxs: string[] = IGNORE_TXS.get(network) as string[];

    if (networkTxs.includes(txId)) {
      // Skip
      return null;
    }
  }

  const txData: RawTxResponse = await downloadTx(txId);
  const { tx } = txData;

  return parseTx(tx);
};

/**
 * Recursively downloads all transactions that were confirmed by a given block
 *
 * @param blockId - The blockId to download the transactions
 * @param txIds - List of transactions to download
 * @param data - Downloaded transactions, used while being called recursively
 */
export const recursivelyDownloadTx = async (
  blockId: string,
  txIds: string[] = [],
  data = new Map<string, FullTx>()
): Promise<Map<string, FullTx>> => {
  if (txIds.length === 0) {
    return data;
  }

  const txId: string = txIds.pop() as string;
  const network: string = process.env.NETWORK || 'mainnet';

  if (IGNORE_TXS.has(network)) {
    const networkTxs: string[] = IGNORE_TXS.get(network) as string[];

    if (networkTxs.includes(txId)) {
      // Skip
      return recursivelyDownloadTx(blockId, txIds, data);
    }
  }

  const txData: RawTxResponse = await downloadTx(txId);
  const { tx, meta } = txData;
  const parsedTx: FullTx = parseTx(tx);

  if (parsedTx.parents.length > 2) {
    // We downloaded a block, we should ignore it
    return recursivelyDownloadTx(blockId, txIds, data);
  }

  // If the first_block from the downloaded tx is not from the block we are searching, we should ignore it.
  if (meta.first_block !== blockId) {
    return recursivelyDownloadTx(blockId, txIds, data);
  }

  // Ignore voided txs
  if (meta.voided_by && meta.voided_by.length && meta.voided_by.length > 0) {
    return recursivelyDownloadTx(blockId, txIds, data);
  }

  // check if we have already downloaded the parents
  const newParents = parsedTx.parents.filter(parent => {
    return (
      txIds.indexOf(parent) < 0 &&
      /* Removing the current tx from the list of transactions to download: */
      parent !== txId &&
      /* Data works as our return list on the recursion and also as a "seen" list on the BFS.
       * We don't want to download a transaction that is already on our seen list.
       */
      !data.has(parent)
    );
  });

  const newData = data.set(parsedTx.txId, parsedTx);

  return recursivelyDownloadTx(blockId, [...txIds, ...newParents], newData);
};

/**
 * Prepares a transaction to be sent to the wallet-service `onNewTxRequest`
 *
 * @param tx - `FullTx` or `FullBlock` representing a typed transaction to be prepared
 */
export const prepareTx = (tx: FullTx | FullBlock): PreparedTx => {
  const prepared = {
    tx_id: tx.txId,
    nonce: tx.nonce,
    timestamp: tx.timestamp,
    version: tx.version,
    weight: tx.weight,
    parents: tx.parents,
    token_name: tx.tokenName,
    token_symbol: tx.tokenSymbol,
    height: tx.height,
    inputs: tx.inputs.map(input => {
      const baseInput: PreparedInput = {
        tx_id: input.txId,
        value: input.value,
        token_data: input.tokenData,
        script: input.script,
        decoded: input.decoded as PreparedDecodedScript,
        index: input.index,
        token: '',
      };

      if (input.tokenData === 0) {
        return {
          ...baseInput,
          token: '00',
        };
      }

      if (!tx.tokens || tx.tokens.length <= 0) {
        throw new Error(
          'Input is a token but there are no tokens in the tokens list.'
        );
      }

      const { uid } = tx.tokens[
        wallet.getTokenIndex(input.decoded.tokenData) - 1
      ];

      return {
        ...baseInput,
        token: uid,
      };
    }),
    outputs: tx.outputs.map(output => {
      const baseOutput: PreparedOutput = {
        value: output.value,
        token_data: output.tokenData,
        script: output.script,
        token: '',
        decoded: output.decoded as PreparedDecodedScript,
      };

      if (output.tokenData === 0) {
        return {
          ...baseOutput,
          token: '00',
        };
      }

      if (!tx.tokens || tx.tokens.length <= 0) {
        throw new Error(
          'Output is a token but there are no tokens in the tokens list.'
        );
      }

      if (!output.decoded || isEmpty(output.decoded) || !output.decoded.type) {
        return baseOutput;
      }

      const { uid } = tx.tokens[
        wallet.getTokenIndex(output.decoded.tokenData) - 1
      ];

      return {
        ...baseOutput,
        token: uid,
      };
    }),
    tokens: tx.tokens,
    raw: tx.raw,
  };

  return prepared;
};

/**
 * Types a tx that was received from the full_node
 *
 * @param tx - The transaction object as received by the full_node
 */
export const parseTx = (tx: RawTx): FullTx => {
  const parsedTx: FullTx = {
    txId: tx.hash as string,
    nonce: tx.nonce as string,
    version: tx.version as number,
    weight: tx.weight as number,
    timestamp: tx.timestamp as number,
    tokenName: tx.token_name ? (tx.token_name as string) : null,
    tokenSymbol: tx.token_symbol ? (tx.token_symbol as string) : null,
    inputs: tx.inputs.map((input: RawInput) => {
      const typedDecodedScript: DecodedScript = {
        type: input.decoded.type as string,
        address: input.decoded.address as string,
        timelock: isNumber(input.decoded.timelock)
          ? (input.decoded.timelock as number)
          : null,
        value: isNumber(input.decoded.value)
          ? (input.decoded.value as number)
          : null,
        tokenData: isNumber(input.decoded.token_data)
          ? (input.decoded.token_data as number)
          : null,
      };
      const typedInput: Input = {
        txId: input.tx_id as string,
        index: input.index as number,
        value: input.value as number,
        tokenData: input.token_data as number,
        script: input.script as string,
        decoded: typedDecodedScript,
      };

      return typedInput;
    }),
    outputs: tx.outputs.map(
      (output: RawOutput): Output => {
        const typedDecodedScript: DecodedScript = {
          type: output.decoded.type as string,
          address: output.decoded.address as string,
          timelock: isNumber(output.decoded.timelock)
            ? (output.decoded.timelock as number)
            : null,
          value: isNumber(output.decoded.value)
            ? (output.decoded.value as number)
            : null,
          tokenData: isNumber(output.decoded.token_data)
            ? (output.decoded.token_data as number)
            : null,
        };

        const typedOutput: Output = {
          value: output.value as number,
          tokenData: output.token_data as number,
          script: output.script as string,
          decoded: typedDecodedScript,
        };

        return typedOutput;
      }
    ),
    parents: tx.parents,
    tokens: tx.tokens,
    raw: tx.raw as string,
  };

  return parsedTx;
};

/**
 * Syncs the latest mempool
 *
 * @generator
 * @yields {MempoolEvent}
 */
export async function* syncLatestMempool(): AsyncGenerator<MempoolEvent> {
  logger.info(`Downloading mempool...`);
  let mempoolResp;
  try {
    mempoolResp = await downloadMempool();
  } catch (e) {
    yield {
      success: false,
      type: 'error',
      message: 'Could not download from mempool api',
    };
    return;
  }

  for (let i = 0; i < mempoolResp.transactions.length; i++) {
    const tx = await downloadTxFromId(mempoolResp.transactions[i]);

    if (tx === null) {
      yield {
        type: 'error',
        success: false,
        message: `[ALERT] Failure on transaction ${mempoolResp.transactions[i]} in mempool`,
      };
      return;
    }

    const preparedTx: PreparedTx = prepareTx(tx);

    try {
      const sendTxResponse: ApiResponse = await sendTx(preparedTx);
      if (!sendTxResponse.success) {
        logger.error(sendTxResponse);
        throw new Error(sendTxResponse.message);
      }
    } catch (e) {
      yield {
        type: 'error',
        success: false,
        message: `[ALERT] Failure on transaction ${preparedTx.tx_id} in mempool`,
      };
      return;
    }

    yield {
      type: 'tx_success',
      success: true,
      txId: preparedTx.tx_id,
    };
  }

  yield {
    success: true,
    type: 'finished',
  };
}

/**
 * Syncs to the latest block
 *
 * @generator
 * @yields {StatusEvent} A status event indicating if a block at a height was successfully sent, \
 * if an error ocurred or if a reorg ocurred.
 */
export async function* syncToLatestBlock(): AsyncGenerator<StatusEvent> {
  const ourBestBlock: Block = await getWalletServiceBestBlock();
  const fullNodeBestBlock: Block = await getFullNodeBestBlock();

  // Check if our best block is still in the fullnode's chain
  const ourBestBlockInFullNode = await getBlockByTxId(ourBestBlock.txId, true);

  if (!ourBestBlockInFullNode.success) {
    logger.warn(ourBestBlockInFullNode.message);

    yield {
      type: 'reorg',
      success: false,
      message: 'Best block not found in the full-node. Reorg?',
    };

    return;
  }

  const { meta } = ourBestBlockInFullNode;

  if (meta.voided_by && meta.voided_by.length && meta.voided_by.length > 0) {
    yield {
      type: 'reorg',
      success: false,
      message: 'Our best block was voided, we should reorg.',
    };

    return;
  }

  if (ourBestBlock.height > meta.height) {
    yield {
      type: 'reorg',
      success: false,
      message:
        "Our height is higher than the wallet-service's height, we should reorg.",
    };

    return;
  }

  logger.info(
    `Downloading ${fullNodeBestBlock.height - ourBestBlock.height} blocks...`
  );
  let success = true;

  blockLoop: for (
    let i = ourBestBlock.height + 1;
    i <= fullNodeBestBlock.height;
    i++
  ) {
    const block: FullBlock = await downloadBlockByHeight(i);
    const preparedBlock: PreparedTx = prepareTx(block);

    // Ignore parents[0] because it is a block
    const blockTxs = [block.parents[1], block.parents[2]];

    // Download block transactions
    const txList: Map<string, FullTx> = await recursivelyDownloadTx(
      block.txId,
      blockTxs
    );
    const txs: FullTx[] = Array.from(txList.values()).sort(
      (x, y) => x.timestamp - y.timestamp
    );

    // Exclude duplicates:
    const uniqueTxs: Record<string, FullTx> = txs.reduce(
      (acc: Record<string, FullTx>, tx: FullTx) => {
        if (tx.txId in acc) {
          return acc;
        }

        return {
          ...acc,
          [tx.txId]: tx,
        };
      },
      {}
    );

    for (const key of Object.keys(uniqueTxs)) {
      const preparedTx: PreparedTx = prepareTx({
        ...uniqueTxs[key],
        height: block.height, // this tx is confirmed by the current block on the loop, we must send its height
      });

      try {
        const sendTxResponse: ApiResponse = await sendTx(preparedTx);

        if (!sendTxResponse.success) {
          throw new Error(sendTxResponse.message);
        }
      } catch (e) {
        logger.error(e);
        yield {
          type: 'transaction_failure',
          success: false,
          message: `Failure on transaction ${preparedTx.tx_id} from block: ${preparedBlock.tx_id}`,
        };

        success = false;

        break blockLoop;
      }
    }

    // We will send the block only after all transactions were sent
    // to be sure that all downloads were succesfull since there is no
    // ROLLBACK yet on the wallet-service.
    const sendBlockResponse: ApiResponse = await sendTx(preparedBlock);

    if (!sendBlockResponse.success) {
      logger.debug(sendBlockResponse);
      yield {
        type: 'error',
        success: false,
        message: `Failure on block ${preparedBlock.tx_id}`,
      };

      success = false;

      break;
    }

    yield {
      type: 'block_success',
      success: true,
      blockId: preparedBlock.tx_id,
      height: preparedBlock.height,
      transactions: Object.keys(uniqueTxs),
    };
  }

  yield {
    success,
    type: 'finished',
  };
}

// Map remembers the insertion order, so we can use it as a FIFO queue
export class LRU {
  max: number;
  cache: Map<string, any>;

  constructor(max: number = 10) {
    this.max = max;
    this.cache = new Map();
  }

  get(txId: string): any {
    const transaction = this.cache.get(txId);

    if (transaction) {
      this.cache.delete(txId);
      // Refresh it in the Map
      this.cache.set(txId, transaction);
    }

    return transaction;
  }

  set(txId: string, transaction: any): void {
    if (this.cache.has(txId)) {
      // Refresh it in the map
      this.cache.delete(txId);
    }

    // Remove oldest
    if (this.cache.size === this.max) {
      this.cache.delete(this.first());
    }

    this.cache.set(txId, transaction);
  }

  first(): string {
    return this.cache.keys().next().value;
  }
}

export const globalCache = new LRU(TX_CACHE_SIZE);
