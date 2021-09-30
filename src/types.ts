/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface Block {
  txId: string;
  height: number;
}

export interface DecodedScript {
  type?: string;
  address?: string;
  timelock?: number | undefined | null;
  value?: number | undefined | null;
  tokenData?: number | undefined | null;
}

export interface Input {
  txId: string;
  value: number;
  tokenData: number;
  script: string;
  decoded: DecodedScript;
  index: number;
  token?: string | undefined | null;
}

export interface Output {
  value: number;
  tokenData: number;
  script: string;
  decoded: DecodedScript;
  token?: string | undefined | null;
}

export interface Token {
  uid: string;
  // Hathor will return name: null and symbol: null
  name: string | null;
  symbol: string | null;
}

export interface FullTx {
  txId: string;
  nonce: string;
  timestamp: number;
  version: number;
  weight: number;
  parents: string[];
  tokenName?: string | null;
  tokenSymbol?: string | null;
  inputs: Input[];
  outputs: Output[];
  tokens?: Token[];
  height?: number;
  raw?: string;
}

export interface FullBlock {
  txId: string;
  nonce?: string;
  timestamp: number;
  version: number;
  weight: number;
  parents: string[];
  tokenName?: string | null;
  tokenSymbol?: string | null;
  inputs: Input[];
  outputs: Output[];
  tokens?: Token[];
  height: number;
  raw?: string;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
}

export interface DownloadBlockApiResponse extends ApiResponse {
  block: FullBlock;
}

export interface SyncSchema {
  states: {
    idle: {};
    mempoolsync: {};
    syncing: {};
    failure: {};
    reorg: {};
  };
}

export interface SyncContext {
  hasMoreBlocks: boolean;
  hasMempoolUpdate: boolean;
  error?: {};
}

/*
TODO: This is not being used in the machine, we should type all events.
export type SyncEvent =
  | { type: 'NEW_BLOCK'; message: any }
  | { type: 'STOP' };
*/

export interface HandlerEvent {
  type: string;
}

export type StatusEvent =
  | {
      type: 'finished';
      success: boolean;
      message?: string;
    }
  | {
      type: 'block_success';
      success: boolean;
      height?: number;
      blockId: string;
      message?: string;
      transactions: string[];
    }
  | {
      type: 'transaction_failure';
      success: boolean;
      message?: string;
    }
  | {
      type: 'reorg';
      success: boolean;
      message?: string;
    }
  | {
      type: 'error';
      success: boolean;
      message?: string;
      error?: string;
    };

export type MempoolEvent =
  | {
      type: 'finished';
      success: boolean;
      message?: string;
    }
  | {
      type: 'tx_success';
      success: boolean;
      txId: string;
      message?: string;
    }
  | {
      type: 'wait';
      success: boolean;
      message?: string;
    }
  | {
      type: 'error';
      success: boolean;
      message?: string;
      error?: string;
    };

/* export interface StatusEvent {
  type: string;
  success: boolean;
  blockId?: string;
  height?: number;
  transactions?: string[];
  message?: string;
  error?: string;
}; */

export interface GeneratorYieldResult<StatusEvent> {
  done?: boolean;
  value: StatusEvent;
}

export interface PreparedDecodedScript {
  type: string;
  address: string;
  timelock?: number | undefined | null;
  value?: number;
  token_data?: number;
}

export interface PreparedInput {
  tx_id: string;
  value: number;
  token_data: number;
  script: string;
  decoded: PreparedDecodedScript;
  index: number;
  token: string;
}

export interface PreparedOutput {
  value: number;
  token_data: number;
  script: string;
  token: string;
  decoded: PreparedDecodedScript;
}

export interface PreparedTx {
  tx_id: string;
  inputs: PreparedInput[];
  outputs: PreparedOutput[];
  timestamp: number;
  version: number;
  weight: number;
  parents: string[];
  nonce?: string;
  height?: number;
  tokens?: Token[];
  token_name?: string | null;
  token_symbol?: string | null;
  raw?: string;
}

export interface RawDecodedInput {
  type: string;
  address: string;
  timelock?: number | null;
  value: number;
  token_data: number;
}

/* Everything is optional because scripts that were not able to
 * be decoded will be returned as {}
 */
export interface RawDecodedOutput {
  type?: string;
  address?: string;
  timelock?: number | null;
  value?: number;
  token_data?: number;
}

export interface RawInput {
  value: number;
  token_data: number;
  script: string;
  decoded: RawDecodedInput;
  tx_id: string;
  index: number;
  token?: string | null;
  spent_by?: string | null;
}

export interface RawOutput {
  value: number;
  token_data: number;
  script: string;
  decoded: RawDecodedOutput;
  token?: string | null;
  spent_by?: string | null;
}

export interface RawTx {
  hash: string;
  nonce: string;
  timestamp: number;
  version: number;
  weight: number;
  parents: string[];
  inputs: RawInput[];
  outputs: RawOutput[];
  tokens: Token[];
  token_name?: string | null;
  token_symbol?: string | null;
  raw: string;
}

export interface Meta {
  hash: string;
  spent_outputs: any;
  received_by: string[];
  children: string[];
  conflict_with: string[];
  voided_by: string[];
  twins: string[];
  accumulated_weight: number;
  score: number;
  height: number;
  validation?: string;
  first_block?: string | null;
}

export interface RawTxResponse {
  tx: RawTx;
  meta: Meta;
  success: boolean;
  message?: string;
  spent_outputs?: any;
}
