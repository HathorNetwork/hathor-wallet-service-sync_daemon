/**
 * Alerts should follow the on-call guide for alerting, see
 * https://github.com/HathorNetwork/ops-tools/blob/master/docs/on-call/guide.md#alert-severitypriority
 */
export enum Severity {
  CRITICAL = 'critical',
  MAJOR = 'major',
  MEDIUM = 'medium',
  MINOR = 'minor',
  WARNING = 'warning',
  INFO = 'info',
}

export interface Transaction {
  // eslint-disable-next-line camelcase
  tx_id: string;
  nonce: number;
  timestamp: number;
  // eslint-disable-next-line camelcase
  signal_bits: number;
  version: number;
  weight: number;
  parents: string[];
  inputs: TxInput[];
  outputs: TxOutput[];
  height?: number;
  // eslint-disable-next-line camelcase
  token_name?: string;
  // eslint-disable-next-line camelcase
  token_symbol?: string;
}
