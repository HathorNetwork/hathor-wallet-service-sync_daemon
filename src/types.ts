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
  type: string;
  address: string;
  timelock?: number;
  value?: number;
  tokenData?: number;
}

export interface Input {
  txId: string;
  value: number;
  tokenData: number;
  script: string;
  decoded: DecodedScript;
  index: number;
  token?: string;
}

export interface Output {
  value: number;
  tokenData: number;
  script: string;
  decoded: DecodedScript;
  token?: string;
  spentBy?: string;
}

export interface Token {
  uid: string;
  name: string;
  symbol: string;
}

export interface FullTx {
  txId: string;
  nonce: string;
  timestamp: number;
  version: number;
  weight: number;
  parents: string[];
  inputs: Input[];
  outputs: Output[];
  tokens?: Token[];
  raw?: string;
}

export interface FullBlock {
  txId: string;
  version: number;
  weight: number;
  timestamp: number;
  isVoided: boolean;
  inputs: Input[];
  outputs: Output[];
  parents: string[];
  tokens?: Token[];
  height: number;
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
    syncing: {};
    failure: {};
    reorg: {};
  }
}

export interface SyncContext {
  hasMoreBlocks: boolean;
  error?: {};
}

/*
TODO: This is not being used in the machine, we should type all events.
export type SyncEvent =
  | { type: 'NEW_BLOCK'; message: any }
  | { type: 'STOP' };
*/

export interface StatusEvent {
  type: string;
  success: boolean;
  blockId?: string;
  height?: number;
  transactions?: string[];
  message?: string;
  error?: string;
};

export interface PreparedDecodedScript {
  type: string;
  address: string;
  timelock?: number;
  value?: number;
  token_data?: number;
}

export interface PreparedInput {
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
  spent_by: string;
  decoded: PreparedDecodedScript;
}

export interface PreparedToken {
  uid: string;
  name: string;
  symbol: string;
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
  tokens?: PreparedToken[];
  token_name?: string;
  token_symbol?: string;
  raw?: string;
}