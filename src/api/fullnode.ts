/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Block,
  FullBlock,
  Input,
  Output,
  DecodedScript,
  RawInput,
  RawOutput,
} from '../types';
import axios from 'axios';
import { globalCache } from '../utils';
import logger from '../logger';

const DEFAULT_SERVER =
  process.env.DEFAULT_SERVER ||
  'https://node1.foxtrot.testnet.hathor.network/v1a/';

/**
 * Returns a transaction from the fullnode
 *
 * @param txId - The transaction id to be downloaded
 * @param noCache - Ignores cached transactions
 */
export const downloadTx = async (txId: string, noCache: boolean = false) => {
  if (!noCache && globalCache.get(txId)) {
    return globalCache.get(txId);
  }

  const response = await axios.get(`${DEFAULT_SERVER}transaction?id=${txId}`);

  if (!noCache) {
    globalCache.set(txId, response.data);
  }

  return response.data;
};

/**
 * Returns a list of transactions on the mempool
 *
 */
export const downloadMempool = async () => {
  const response = await axios.get(`${DEFAULT_SERVER}mempool`);

  const data = response.data;

  if (!data.success) {
    logger.error(data);
    throw new Error('Mempool API failure');
  }
  return data;
};

/**
 * Returns a `FullBlock` downloaded from the full_node
 *
 * @param height - The block's height
 */
export const downloadBlockByHeight = async (
  height: number
): Promise<FullBlock> => {
  const response = await axios.get(
    `${DEFAULT_SERVER}block_at_height?height=${height}`
  );

  const data = response.data;

  if (!data.success) {
    throw new Error(`Block height ${height} download failed`);
  }

  const responseBlock = data.block;

  const block: FullBlock = {
    txId: responseBlock.tx_id as string,
    version: responseBlock.version as number,
    weight: responseBlock.weight as number,
    timestamp: responseBlock.timestamp as number,
    nonce: responseBlock.nonce as string,
    inputs: responseBlock.inputs.map((input: RawInput) => {
      const typedDecodedScript: DecodedScript = {
        type: input.decoded.type as string,
        address: input.decoded.address as string,
        timelock: input.decoded.timelock
          ? (input.decoded.timelock as number)
          : null,
        value: input.decoded.value ? (input.decoded.value as number) : null,
        tokenData: input.decoded.token_data
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
        token: input.token as string,
      };

      return typedInput;
    }),
    outputs: responseBlock.outputs.map(
      (output: RawOutput): Output => {
        const typedDecodedScript: DecodedScript = {
          type: output.decoded.type as string,
          address: output.decoded.address as string,
          timelock: output.decoded.timelock
            ? (output.decoded.timelock as number)
            : null,
          value: output.decoded.value ? (output.decoded.value as number) : null,
          tokenData: output.decoded.token_data
            ? (output.decoded.token_data as number)
            : null,
        };

        const typedOutput: Output = {
          value: output.value as number,
          tokenData: output.token_data as number,
          script: output.script as string,
          decoded: typedDecodedScript,
          token: output.token as string,
        };

        return typedOutput;
      }
    ),
    parents: responseBlock.parents,
    height: responseBlock.height as number,
  };

  return block;
};

/**
 * Downloads a block from the full_node using the `block_at_height` API
 *
 * @param txId - The block txId
 * @param noCache - Prevents downloading the block from cache as a reorg may have ocurred
 */
export const getBlockByTxId = async (
  txId: string,
  noCache: boolean = false
) => {
  return downloadTx(txId, noCache);
};

/**
 * Returns the best block from the full_node as a typed `Block`.
 * TODO FIXME: Change this method to query the best block from the `/v1a/get_block_template` or
 * a specialized API from the full_node to query its best block.
 */
export const getFullNodeBestBlock = async (): Promise<Block> => {
  const response = await axios.get(
    `${DEFAULT_SERVER}transaction?type=block&count=1`
  );
  const { transactions } = response.data;

  const bestBlock: Block = {
    txId: transactions[0].tx_id as string,
    height: transactions[0].height as number,
  };

  return bestBlock;
};
