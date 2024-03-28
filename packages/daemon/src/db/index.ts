/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import mysql, { Connection as MysqlConnection, Pool } from 'mysql2/promise';
import {
  TokenBalanceMap,
  DbTxOutput,
  StringMap,
  Wallet,
  TxInput,
  TxOutputWithIndex,
  EventTxInput,
  GenerateAddresses,
  AddressIndexMap,
  LastSyncedEvent,
  AddressBalance,
  AddressTotalBalance,
  DbTransaction,
  TokenInfo,
  Miner,
  TokenSymbolsRow,
} from '../types';
import { isAuthority } from '../utils';
import {
  AddressBalanceRow,
  AddressTxHistorySumRow,
  BestBlockRow,
  LastSyncedEventRow,
  MinerRow,
  TokenInformationRow,
  TransactionRow,
  TxOutputRow,
} from '../types';
// @ts-ignore
import { walletUtils } from '@hathor/wallet-lib';
import getConfig from '../config';

console.log(walletUtils);

let pool: Pool;

/**
 * Get a database connection.
 *
 * @returns The database connection
 */
export const getDbConnection = async (): Promise<MysqlConnection> => {
  if (!pool) {
    const {
      DB_ENDPOINT,
      DB_NAME,
      DB_USER,
      DB_PORT,
      DB_PASS,
    } = getConfig();
    const newPool: Pool = mysql.createPool({
      host: DB_ENDPOINT,
      database: DB_NAME,
      user: DB_USER,
      port: DB_PORT,
      password: DB_PASS,
    });

    pool = newPool;
  }

  return pool.getConnection();
};

/**
 * Add a tx to the transaction table.
 *
 * @remarks
 * This method adds a transaction to the transaction table
 *
 * @param mysql - Database connection
 * @param txId - Transaction id
 * @param timestamp - The transaction timestamp
 * @param version - The transaction version
 * @param weight - the transaction weight
 */
export const addOrUpdateTx = async (
  mysql: any,
  txId: string,
  height: number | null,
  timestamp: number,
  version: number,
  weight: number,
): Promise<void> => {
  const entries = [[txId, height, timestamp, version, weight]];

  await mysql.query(
    `INSERT INTO \`transaction\` (tx_id, height, timestamp, version, weight)
     VALUES ?
         ON DUPLICATE KEY UPDATE height = ?`,
    [entries, height],
  );
};

/**
 * Add a tx outputs to the utxo table.
 *
 * @remarks
 * This function receives a list of outputs and supposes they're all from the same block
 * or transaction. So if heighlock is set, it'll be set to all outputs.
 *
 * @param mysql - Database connection
 * @param txId - Transaction id
 * @param outputs - The transaction outputs
 * @param heightlock - Block heightlock
 */
export const addUtxos = async (
  mysql: any,
  txId: string,
  outputs: TxOutputWithIndex[],
  heightlock: number | null = null,
): Promise<void> => {
  // outputs might be empty if we're destroying authorities
  if (outputs.length === 0) return;

  const entries = outputs.map(
    (output) => {
      let authorities = 0;
      let value = output.value;

      if (isAuthority(output.token_data)) {
        authorities = value;
        value = 0;
      }

      return [
        txId,
        output.index,
        output.token,
        value,
        authorities,
        output.decoded?.address,
        output.decoded?.timelock,
        heightlock,
        output.locked,
      ];
    },
  );

  // we are safe to ignore duplicates because our transaction might have already been in the mempool
  await mysql.query(
    `INSERT INTO \`tx_output\` (\`tx_id\`, \`index\`, \`token_id\`,
                           \`value\`, \`authorities\`, \`address\`,
                           \`timelock\`, \`heightlock\`, \`locked\`)
     VALUES ?
     ON DUPLICATE KEY UPDATE tx_id=tx_id`,
    [entries],
  );
};

/**
 * Remove a tx inputs from the utxo table.
 *
 * @param mysql - Database connection
 * @param inputs - The transaction inputs
 * @param txId - The transaction that spent these utxos
 */
export const updateTxOutputSpentBy = async (mysql: any, inputs: TxInput[], txId: string): Promise<void> => {
  const entries = inputs.map((input) => [input.tx_id, input.index]);
  // entries might be empty if there are no inputs
  if (entries.length) {
    // get the rows before deleting

    /* We are forcing this query to use the PRIMARY index because MySQL is not using the index when there is
     * more than 185 elements in the IN query. I couldn't find a reason for that. Here is the EXPLAIN with exactly 185
     * elements:
     * +----+-------------+-----------+------------+-------+---------------+---------+---------+-------------+------+
     * | id | select_type | table     | partitions | type  | possible_keys | key     | key_len | ref         | rows |
     * +----+-------------+-----------+------------+-------+---------------+---------+---------+-------------+------+
     * |  1 | UPDATE      | tx_output | NULL       | range | PRIMARY       | PRIMARY | 259     | const,const |  250 |
     * +----+-------------+-----------+------------+-------+---------------+---------+---------+-------------+------+
     *
     * And here is the EXPLAIN query with exactly 186 elements:
     * +----+-------------+-----------+------------+-------+---------------+---------+---------+------+---------+
     * | id | select_type | table     | partitions | type  | possible_keys | key     | key_len | ref  | rows    |
     * +----+-------------+-----------+------------+-------+---------------+---------+---------+------+---------+
     * |  1 | UPDATE      | tx_output | NULL       | index | NULL          | PRIMARY | 259     | NULL | 1933979 |
     * +----+-------------+-----------+------------+-------+---------------+---------+---------+------+---------+
     */
    await mysql.query(
      `UPDATE \`tx_output\` USE INDEX (PRIMARY)
          SET \`spent_by\` = ?
        WHERE (\`tx_id\` ,\`index\`)
           IN (?)`,
      [txId, entries],
    );
  }
};

/**
 * Get a list of tx outputs from a transaction
 *
 * @param mysql - Database connection
 * @param transaction - The hash of the transaction

 * @returns A list of tx outputs
 */
export const getTxOutputsFromTx = async (
  mysql: any,
  txId: string,
): Promise<DbTxOutput[]> => {
  const [results] = await mysql.query(
    `SELECT *
       FROM \`tx_output\`
      WHERE \`tx_id\` = ?`,
    [txId],
  );

  const utxos = [];
  for (const result of results) {
    const utxo: DbTxOutput = {
      txId: result.tx_id as string,
      index: result.index as number,
      tokenId: result.token_id as string,
      address: result.address as string,
      value: result.value as number,
      authorities: result.authorities as number,
      timelock: result.timelock as number,
      heightlock: result.heightlock as number,
      locked: result.locked > 0,
      txProposalId: result.tx_proposal as string,
      txProposalIndex: result.tx_proposal_index as number,
      spentBy: result.spent_by ? result.spent_by as string : null,
    };
    utxos.push(utxo);
  }

  return utxos;
};
/**
 * Get a list of tx outputs from a list of txId and indexes
 *
 * @param mysql - Database connection
 * @param transactions - The list of transactions

 * @returns A list of tx outputs
 */
export const getTxOutputs = async (
  mysql: any,
  inputs: {txId: string, index: number}[],
): Promise<DbTxOutput[]> => {
  if (inputs.length <= 0) return [];
  const txIdIndexPair = inputs.map((utxo) => [utxo.txId, utxo.index]);
  const [results] = await mysql.query(
    `SELECT *
       FROM \`tx_output\`
      WHERE (\`tx_id\`, \`index\`) IN (?)`,
    [txIdIndexPair],
  );

  const utxos = [];
  for (const result of results) {
    const utxo: DbTxOutput = {
      txId: result.tx_id as string,
      index: result.index as number,
      tokenId: result.token_id as string,
      address: result.address as string,
      value: result.value as number,
      authorities: result.authorities as number,
      timelock: result.timelock as number,
      heightlock: result.heightlock as number,
      locked: result.locked > 0,
      txProposalId: result.tx_proposal as string,
      txProposalIndex: result.tx_proposal_index as number,
      spentBy: result.spent_by ? result.spent_by as string : null,
    };
    utxos.push(utxo);
  }

  return utxos;
};

/**
 * Get the requested tx output.
 *
 * @param mysql - Database connection
 * @param txId - The tx id to search
 * @param index - The index to search
 * @param skipSpent - Skip spent tx_output (if we want only utxos)
 * @returns The requested tx_output or null if it is not found
 */
export const getTxOutput = async (
  mysql: MysqlConnection,
  txId: string,
  index: number,
  skipSpent: boolean,
): Promise<DbTxOutput | null> => {
  const [results] = await mysql.query<TxOutputRow[]>(
    `SELECT *
       FROM \`tx_output\`
      WHERE \`tx_id\` = ?
        AND \`index\` = ?
        ${skipSpent ? 'AND `spent_by` IS NULL' : ''}
        AND \`voided\` = FALSE`,
    [txId, index],
  );

  if (!results.length || results.length === 0) {
    return null;
  }

  const result = results[0];

  const txOutput: DbTxOutput = mapDbResultToDbTxOutput(result);

  return txOutput;
};

/**
 * Get tx outputs at a given height
 *
 * @param mysql - Database connection
 * @param height - The height to search for
 *
 * @returns The requested tx_outputs
 */
export const getTxOutputsAtHeight = async (
  mysql: MysqlConnection,
  height: number,
): Promise<DbTxOutput[]> => {
  const [results] = await mysql.query<TxOutputRow[]>(
    `SELECT *
       FROM \`tx_output\`
      WHERE \`tx_id\` IN (
              SELECT tx_id
                FROM transaction
               WHERE height = ?
            )
        AND \`voided\` = FALSE`,
    [height],
  );
  const rows = results;

  const utxos = [];
  for (const result of rows) {
    const utxo: DbTxOutput = {
      txId: result.tx_id as string,
      index: result.index as number,
      tokenId: result.token_id as string,
      address: result.address as string,
      value: result.value as number,
      authorities: result.authorities as number,
      timelock: result.timelock as number,
      heightlock: result.heightlock as number,
      // @ts-ignore
      locked: result.locked > 0,
      spentBy: result.spent_by as string,
      txProposalId: result.tx_proposal as string,
      txProposalIndex: result.tx_proposal_index as number,
    };
    utxos.push(utxo);
  }

  return utxos;
};

export const voidTransaction = async (
  mysql: any,
  txId: string,
  addressBalanceMap: StringMap<TokenBalanceMap>,
): Promise<void> => {
  const addressEntries = Object.keys(addressBalanceMap).map((address) => [address, 0]);
  await mysql.query(
    `INSERT INTO \`address\`(\`address\`, \`transactions\`)
          VALUES ?
              ON DUPLICATE KEY UPDATE transactions = transactions - 1`,
    [addressEntries],
  );

  const entries = [];
  for (const [address, tokenMap] of Object.entries(addressBalanceMap)) {
    for (const [token, tokenBalance] of tokenMap.iterator()) {
      // update address_balance table or update balance and transactions if there's an entry already
      const entry = {
        address,
        token_id: token,
        // totalAmountSent is the sum of the value of all outputs of this token on the tx being sent to this address
        // which means it is the "total_received" for this address
        total_received: tokenBalance.totalAmountSent,
        // if it's < 0, there must be an entry already, so it will execute "ON DUPLICATE KEY UPDATE" instead of setting it to 0
        unlocked_balance: (tokenBalance.unlockedAmount < 0 ? 0 : tokenBalance.unlockedAmount),
        // this is never less than 0, as locked balance only changes when a tx is unlocked
        locked_balance: tokenBalance.lockedAmount,
        unlocked_authorities: tokenBalance.unlockedAuthorities.toUnsignedInteger(),
        locked_authorities: tokenBalance.lockedAuthorities.toUnsignedInteger(),
        timelock_expires: tokenBalance.lockExpires,
        transactions: 1,
      };

      // save the smaller value of timelock_expires, when not null
      await mysql.query(
        `INSERT INTO address_balance
                 SET ?
                  ON DUPLICATE KEY
                            UPDATE total_received = total_received - ?,
                                   unlocked_balance = unlocked_balance - ?,
                                   locked_balance = locked_balance - ?,
                                   transactions = transactions - 1,
                                   timelock_expires = CASE
                                                        WHEN timelock_expires IS NULL THEN VALUES(timelock_expires)
                                                        WHEN VALUES(timelock_expires) IS NULL THEN timelock_expires
                                                        ELSE LEAST(timelock_expires, VALUES(timelock_expires))
                                                      END,
                                   unlocked_authorities = (unlocked_authorities | VALUES(unlocked_authorities)),
                                   locked_authorities = locked_authorities | VALUES(locked_authorities)`,
        [entry, tokenBalance.totalAmountSent, tokenBalance.unlockedAmount, tokenBalance.lockedAmount, address, token],
      );

      // if we're removing any of the authorities, we need to refresh the authority columns. Unlike the values,
      // we cannot only sum/subtract, as authorities are binary: you have it or you don't. We might be spending
      // an authority output in this tx without creating a new one, but it doesn't mean this address does not
      // have this authority anymore, as it might have other authority outputs
      if (tokenBalance.unlockedAuthorities.hasNegativeValue()) {
        await mysql.query(
          `UPDATE \`address_balance\`
              SET \`unlocked_authorities\` = (
                SELECT BIT_OR(\`authorities\`)
                  FROM \`tx_output\`
                 WHERE \`address\` = ?
                   AND \`token_id\` = ?
                   AND \`locked\` = FALSE
                   AND \`spent_by\` IS NULL
                   AND \`voided\` = FALSE
              )
            WHERE \`address\` = ?
              AND \`token_id\` = ?`,
          [address, token, address, token],
        );
      }
      // for locked authorities, it doesn't make sense to perform the same operation. The authority needs to be
      // unlocked before it can be spent. In case we're just adding new locked authorities, this will be taken
      // care by the first sql query.

      // update address_tx_history with one entry for each pair (address, token)
      entries.push(txId);
    }
  }

  await mysql.query(
    `DELETE FROM \`address_tx_history\`
      WHERE \`tx_id\`
      IN (?)`,
    [entries],
  );

  await mysql.query(
    `UPDATE \`transaction\`
        SET \`voided\` = TRUE
      WHERE \`tx_id\`
      IN (?)`,
    [entries],
  );
};

/**
 * Update addresses tables with a new transaction.
 *
 * @remarks
 * When a new transaction arrives, it will change the balance and tx history for addresses. This function
 * updates the address, address_balance and address_tx_history tables with information from this transaction.
 *
 * @param mysql - Database connection
 * @param txId - Transaction id
 * @param timestamp - Transaction timestamp
 * @param addressBalanceMap - Map with the transaction's balance for each address
 */
export const updateAddressTablesWithTx = async (
  mysql: any,
  txId: string,
  timestamp: number,
  addressBalanceMap: StringMap<TokenBalanceMap>,
): Promise<void> => {
  /*
   * update address table
   *
   * If an address is not yet present, add entry with index = null, walletId = null and transactions = 1.
   * Later, when the corresponding wallet is started, index and walletId will be updated.
   *
   * If address is already present, just increment the transactions counter.
   */
  const addressEntries = Object.keys(addressBalanceMap).map((address) => [address, 1]);
  await mysql.query(
    `INSERT INTO \`address\`(\`address\`, \`transactions\`)
          VALUES ?
              ON DUPLICATE KEY UPDATE transactions = transactions + 1`,
    [addressEntries],
  );

  const entries = [];
  for (const [address, tokenMap] of Object.entries(addressBalanceMap)) {
    for (const [token, tokenBalance] of tokenMap.iterator()) {
      // update address_balance table or update balance and transactions if there's an entry already
      const entry = {
        address,
        token_id: token,
        // totalAmountSent is the sum of the value of all outputs of this token on the tx being sent to this address
        // which means it is the "total_received" for this address
        total_received: tokenBalance.totalAmountSent,
        // if it's < 0, there must be an entry already, so it will execute "ON DUPLICATE KEY UPDATE" instead of setting it to 0
        unlocked_balance: (tokenBalance.unlockedAmount < 0 ? 0 : tokenBalance.unlockedAmount),
        // this is never less than 0, as locked balance only changes when a tx is unlocked
        locked_balance: tokenBalance.lockedAmount,
        unlocked_authorities: tokenBalance.unlockedAuthorities.toUnsignedInteger(),
        locked_authorities: tokenBalance.lockedAuthorities.toUnsignedInteger(),
        timelock_expires: tokenBalance.lockExpires,
        transactions: 1,
      };
      // save the smaller value of timelock_expires, when not null
      await mysql.query(
        `INSERT INTO address_balance
                 SET ?
                  ON DUPLICATE KEY
                            UPDATE total_received = total_received + ?,
                                   unlocked_balance = unlocked_balance + ?,
                                   locked_balance = locked_balance + ?,
                                   transactions = transactions + 1,
                                   timelock_expires = CASE
                                                        WHEN timelock_expires IS NULL THEN VALUES(timelock_expires)
                                                        WHEN VALUES(timelock_expires) IS NULL THEN timelock_expires
                                                        ELSE LEAST(timelock_expires, VALUES(timelock_expires))
                                                      END,
                                   unlocked_authorities = (unlocked_authorities | VALUES(unlocked_authorities)),
                                   locked_authorities = locked_authorities | VALUES(locked_authorities)`,
        [entry, tokenBalance.totalAmountSent, tokenBalance.unlockedAmount, tokenBalance.lockedAmount, address, token],
      );

      // if we're removing any of the authorities, we need to refresh the authority columns. Unlike the values,
      // we cannot only sum/subtract, as authorities are binary: you have it or you don't. We might be spending
      // an authority output in this tx without creating a new one, but it doesn't mean this address does not
      // have this authority anymore, as it might have other authority outputs
      if (tokenBalance.unlockedAuthorities.hasNegativeValue()) {
        await mysql.query(
          `UPDATE \`address_balance\`
              SET \`unlocked_authorities\` = (
                SELECT BIT_OR(\`authorities\`)
                  FROM \`tx_output\`
                 WHERE \`address\` = ?
                   AND \`token_id\` = ?
                   AND \`locked\` = FALSE
                   AND \`spent_by\` IS NULL
                   AND \`voided\` = FALSE
              )
            WHERE \`address\` = ?
              AND \`token_id\` = ?`,
          [address, token, address, token],
        );
      }
      // for locked authorities, it doesn't make sense to perform the same operation. The authority needs to be
      // unlocked before it can be spent. In case we're just adding new locked authorities, this will be taken
      // care by the first sql query.

      // update address_tx_history with one entry for each pair (address, token)
      entries.push([address, txId, token, tokenBalance.total(), timestamp]);
    }
  }

  await mysql.query(
    `INSERT INTO \`address_tx_history\`(\`address\`, \`tx_id\`,
                                        \`token_id\`, \`balance\`,
                                        \`timestamp\`)
     VALUES ?`,
    [entries],
  );
};

/**
 * Get a transaction by its ID.
 *
 * @param mysql - Database connection
 * @param txId - A transaction ID
 * @returns The requested transaction
 */
export const getTransactionById = async (
  mysql: MysqlConnection,
  txId: string,
): Promise<DbTransaction | null> => {
  const [result] = await mysql.query<TransactionRow[]>(`
   SELECT *
     FROM transaction
    WHERE tx_id = ?
  `, [txId]);

  if (result.length <= 0) {
    return null;
  }

  return result[0] as DbTransaction;
};

/**
 * Get the utxos that are locked at a certain height.
 *
 * @remarks
 * UTXOs from blocks are locked by height. This function returns the ones that are locked at the given height.
 *
 * Also, these UTXOs might have a timelock. Even though this is not common, it is also considered.
 *
 * @param mysql - Database connection
 * @param now - Current timestamp
 * @param height - The block height queried
 * @returns A list of UTXOs locked at the given height
 */
export const getUtxosLockedAtHeight = async (
  mysql: MysqlConnection,
  now: number,
  height: number,
): Promise<DbTxOutput[]> => {
  const utxos = [];
  if (height >= 0) {
    const [results] = await mysql.query<TxOutputRow[]>(
      `SELECT *
         FROM \`tx_output\`
        WHERE \`heightlock\` = ?
          AND \`spent_by\` IS NULL
          AND \`voided\` = FALSE
          AND (\`timelock\` <= ?
               OR \`timelock\` is NULL)
          AND \`locked\` = 1`,
      [height, now],
    );

    const rows = results;

    for (const result of rows) {
      const utxo: DbTxOutput = {
        txId: result.tx_id as string,
        index: result.index as number,
        tokenId: result.token_id as string,
        address: result.address as string,
        value: result.value as number,
        authorities: result.authorities as number,
        timelock: result.timelock as number,
        heightlock: result.heightlock as number,
        // @ts-ignore
        locked: result.locked > 0,
      };
      utxos.push(utxo);
    }
  }
  return utxos;
};

/**
 * Mark UTXOs as unlocked.
 *
 * @param mysql - Database connection
 * @param utxos - List of UTXOs to unlock
 */
export const unlockUtxos = async (mysql: MysqlConnection, utxos: TxInput[]): Promise<void> => {
  if (utxos.length === 0) return;
  const entries = utxos.map((utxo) => [utxo.tx_id, utxo.index]);
  await mysql.query(
    `UPDATE \`tx_output\`
        SET \`locked\` = FALSE
      WHERE (\`tx_id\` ,\`index\`)
         IN (?)`,
    [entries],
  );
};

/**
 * Update the unlocked and locked balances for addresses.
 *
 * @remarks
 * The balance of an address might change as a locked amount becomes unlocked. This function updates
 * the address_balance table, subtracting from the locked column and adding to the unlocked column.
 *
 * @param mysql - Database connection
 * @param addressBalanceMap - A map of addresses and the unlocked balances
 * @param updateTimelock - If this update is triggered by a timelock expiring, update the next expire timestamp
 */
export const updateAddressLockedBalance = async (
  mysql: MysqlConnection,
  addressBalanceMap: StringMap<TokenBalanceMap>,
  updateTimelocks = false,
): Promise<void> => {
  for (const [address, tokenBalanceMap] of Object.entries(addressBalanceMap)) {
    for (const [token, tokenBalance] of tokenBalanceMap.iterator()) {
      await mysql.query(
        `UPDATE \`address_balance\`
            SET \`unlocked_balance\` = \`unlocked_balance\` + ?,
                \`locked_balance\` = \`locked_balance\` - ?,
                \`unlocked_authorities\` = (unlocked_authorities | ?)
          WHERE \`address\` = ?
            AND \`token_id\` = ?`, [
          tokenBalance.unlockedAmount,
          tokenBalance.unlockedAmount,
          tokenBalance.unlockedAuthorities.toInteger(),
          address,
          token,
        ],
      );

      // if any authority has been unlocked, we have to refresh the locked authorities
      if (tokenBalance.unlockedAuthorities.toInteger() > 0) {
        await mysql.query(
          `UPDATE \`address_balance\`
              SET \`locked_authorities\` = (
                SELECT BIT_OR(\`authorities\`)
                  FROM \`tx_output\`
                 WHERE \`address\` = ?
                   AND \`token_id\` = ?
                   AND \`locked\` = TRUE
                   AND \`spent_by\` IS NULL
                   AND \`voided\` = FALSE)
                 WHERE \`address\` = ?
                   AND \`token_id\` = ?`,
          [address, token, address, token],
        );
      }

      // if this is being unlocked due to a timelock, also update the timelock_expires column
      if (updateTimelocks) {
        await mysql.query(`
          UPDATE \`address_balance\`
             SET \`timelock_expires\` = (
               SELECT MIN(\`timelock\`)
                 FROM \`tx_output\`
                WHERE \`address\` = ?
                  AND \`token_id\` = ?
                  AND \`locked\` = TRUE
                  AND \`spent_by\` IS NULL
                  AND \`voided\` = FALSE
             )
           WHERE \`address\` = ?
             AND \`token_id\` = ?`,
        [address, token, address, token]);
      }
    }
  }
};

/**
 * Get wallet information for the given addresses.
 *
 * @remarks
 * For each address in the list, check if it's from a started wallet and return its information. If
 * address is not from a started wallet, it won't be on the final map.
 *
 * @param mysql - Database connection
 * @param addresses - Addresses to fetch wallet information
 * @returns A map of address and corresponding wallet information
 */
export const getAddressWalletInfo = async (mysql: MysqlConnection, addresses: string[]): Promise<StringMap<Wallet>> => {
  const addressWalletMap: StringMap<Wallet> = {};
  const [results] = await mysql.query(
    `SELECT DISTINCT a.\`address\`,
                     a.\`wallet_id\`,
                     w.\`auth_xpubkey\`,
                     w.\`xpubkey\`,
                     w.\`max_gap\`
       FROM \`address\` a
 INNER JOIN \`wallet\` w
         ON a.wallet_id = w.id
      WHERE a.\`address\`
         IN (?)`,
    [addresses],
  );

  // @ts-ignore
  for (const entry of results) {
    const walletInfo: Wallet = {
      walletId: entry.wallet_id as string,
      authXpubkey: entry.auth_xpubkey as string,
      xpubkey: entry.xpubkey as string,
      maxGap: entry.max_gap as number,
    };
    addressWalletMap[entry.address as string] = walletInfo;
  }
  return addressWalletMap;
};

/**
 * Update the unlocked and locked balances for wallets.
 *
 * @remarks
 * The balance of a wallet might change as a locked amount becomes unlocked. This function updates
 * the wallet_balance table, subtracting from the locked column and adding to the unlocked column.
 *
 * @param mysql - Database connection
 * @param walletBalanceMap - A map of walletId and the unlocked balances
 * @param updateTimelocks - If this update is triggered by a timelock expiring, update the next lock expiration
 */
export const updateWalletLockedBalance = async (
  mysql: MysqlConnection,
  walletBalanceMap: StringMap<TokenBalanceMap>,
  updateTimelocks = false,
): Promise<void> => {
  for (const [walletId, tokenBalanceMap] of Object.entries(walletBalanceMap)) {
    for (const [token, tokenBalance] of tokenBalanceMap.iterator()) {
      await mysql.query(
        `UPDATE \`wallet_balance\`
            SET \`unlocked_balance\` = \`unlocked_balance\` + ?,
                \`locked_balance\` = \`locked_balance\` - ?,
                \`unlocked_authorities\` = (\`unlocked_authorities\` | ?)
          WHERE \`wallet_id\` = ?
            AND \`token_id\` = ?`,
        [tokenBalance.unlockedAmount, tokenBalance.unlockedAmount,
          tokenBalance.unlockedAuthorities.toInteger(), walletId, token],
      );

      // if any authority has been unlocked, we have to refresh the locked authorities
      if (tokenBalance.unlockedAuthorities.toInteger() > 0) {
        await mysql.query(
          `UPDATE \`wallet_balance\`
              SET \`locked_authorities\` = (
                SELECT BIT_OR(\`locked_authorities\`)
                  FROM \`address_balance\`
                 WHERE \`address\` IN (
                   SELECT \`address\`
                     FROM \`address\`
                    WHERE \`wallet_id\` = ?)
                    AND \`token_id\` = ?)
            WHERE \`wallet_id\` = ?
              AND \`token_id\` = ?`,
          [walletId, token, walletId, token],
        );
      }

      // if this is being unlocked due to a timelock, also update the timelock_expires column
      if (updateTimelocks) {
        await mysql.query(
          `UPDATE \`wallet_balance\`
              SET \`timelock_expires\` = (
                SELECT MIN(\`timelock_expires\`)
                  FROM \`address_balance\`
                 WHERE \`address\`
                    IN (
                      SELECT \`address\`
                        FROM \`address\`
                       WHERE \`wallet_id\` = ?)
                   AND \`token_id\` = ?)
            WHERE \`wallet_id\` = ? AND \`token_id\` = ?`,
          [walletId, token, walletId, token],
        );
      }
    }
  }
};

/**
 * Add a miner to the database
 *
 * @param mysql - Database connection
 */
export const addMiner = async (
  mysql: MysqlConnection,
  address: string,
  txId: string,
): Promise<void> => {
  await mysql.query(
    `INSERT INTO \`miner\` (address, first_block, last_block, count)
     VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE last_block = ?, count = count + 1`,
    [address, txId, txId, txId],
  );
};

/**
 * Get the list of miners on database
 *
 * @param mysql - Database connection

 * @returns A list of strings with miners addresses
 */
export const getMinersList = async (
  mysql: MysqlConnection,
): Promise<Miner[]> => {
  const [results] = await mysql.query<MinerRow[]>(`
    SELECT address, first_block, last_block, count
      FROM miner;
  `);

  const minerList: Miner[] = [];

  for (const result of results) {
    minerList.push({
      address: result.address as string,
      firstBlock: result.first_block as string,
      lastBlock: result.last_block as string,
      count: result.count as number,
    });
  }

  return minerList;
};

/**
 * Get from database utxos that must be unlocked because their timelocks expired
 *
 * @param mysql - Database connection
 * @param now - Current timestamp

 * @returns A list of timelocked utxos
 */
export const getExpiredTimelocksUtxos = async (
  mysql: MysqlConnection,
  now: number,
): Promise<DbTxOutput[]> => {
  const [results] = await mysql.query<TxOutputRow[]>(`
    SELECT *
      FROM tx_output
     WHERE locked = TRUE
       AND timelock IS NOT NULL
       AND timelock < ?
  `, [now]);

  const lockedUtxos: DbTxOutput[] = results.map(mapDbResultToDbTxOutput);

  return lockedUtxos;
};

/**
 * Maps the result from the database to DbTxOutput
 *
 * @param results - The tx_output results from the database
 * @returns A list of tx_outputs mapped to the DbTxOutput type
 */
export const mapDbResultToDbTxOutput = (result: TxOutputRow): DbTxOutput => ({
  txId: result.tx_id as string,
  index: result.index as number,
  tokenId: result.token_id as string,
  address: result.address as string,
  value: result.value as number,
  authorities: result.authorities as number,
  timelock: result.timelock as number,
  heightlock: result.heightlock as number,
  locked: result.locked ? Boolean(result.locked) : false,
  txProposalId: result.tx_proposal as string,
  txProposalIndex: result.tx_proposal_index as number,
  spentBy: result.spent_by as string,
});

/**
 * Store the token information.
 *
 * @param mysql - Database connection
 * @param tokenId - The token's id
 * @param tokenName - The token's name
 * @param tokenSymbol - The token's symbol
 */
export const storeTokenInformation = async (
  mysql: MysqlConnection,
  tokenId: string,
  tokenName: string,
  tokenSymbol: string,
): Promise<void> => {
  const entry = { id: tokenId, name: tokenName, symbol: tokenSymbol };
  await mysql.query(
    'INSERT INTO `token` SET ?',
    [entry],
  );
};

/**
 * Get tx inputs that are still marked as locked.
 *
 * @remarks
 * At first, it doesn't make sense to talk about locked inputs. Any UTXO can only be spent after
 * it's unlocked. However, in this service, we have a "lazy" unlock policy, only unlocking the UTXOs
 * when the wallet owner requests its balance. Therefore, we might receive a transaction with a UTXO
 * that is sill marked as locked in our database. That might happen if the user sends his transaction
 * using a service other than this one. Otherwise the locked amount would have been updated before
 * sending.
 *
 * @param mysql - Database connection
 * @param inputs - The transaction inputs
 * @returns The locked UTXOs
 */
export const getLockedUtxoFromInputs = async (mysql: MysqlConnection, inputs: EventTxInput[]): Promise<DbTxOutput[]> => {
  const entries = inputs.map((input) => [input.tx_id, input.index]);
  // entries might be empty if there are no inputs
  if (entries.length) {
    // get the rows before deleting
    const [results] = await mysql.query<TxOutputRow[]>(
      `SELECT *
         FROM \`tx_output\` USE INDEX (PRIMARY)
        WHERE (\`tx_id\` ,\`index\`)
           IN (?)
          AND \`locked\` = TRUE
          AND \`spent_by\` IS NULL
          AND \`voided\` = FALSE`,
      [entries],
    );

    return results.map((utxo) => ({
      txId: utxo.tx_id as string,
      index: utxo.index as number,
      tokenId: utxo.token_id as string,
      address: utxo.address as string,
      value: utxo.value as number,
      authorities: utxo.authorities as number,
      timelock: utxo.timelock as number,
      heightlock: utxo.heightlock as number,
      locked: utxo.locked ? Boolean(utxo.locked) : false,
    }));
  }

  return [];
};

/**
 * Increment a list of tokens transactions count
 *
 * @param mysql - Database connection
 * @param tokenList - The list of tokens to increment
 */
export const incrementTokensTxCount = async (
  mysql: MysqlConnection,
  tokenList: string[],
): Promise<void> => {
  await mysql.query(`
    UPDATE \`token\`
       SET \`transactions\` = \`transactions\` + 1
     WHERE \`id\` IN (?)
  `, [tokenList]);
};

/**
 * Given an xpubkey, generate its addresses.
 *
 * @remarks
 * Also, check which addresses are used, taking into account the maximum gap of unused addresses (maxGap).
 * This function doesn't update anything on the database, just reads data from it.
 *
 * @param mysql - Database connection
 * @param xpubkey - The xpubkey
 * @param maxGap - Number of addresses that should have no transactions before we consider all addresses loaded
 * @returns Object with all addresses for the given xpubkey and corresponding index
 */
export const generateAddresses = async (mysql: MysqlConnection, xpubkey: string, maxGap: number): Promise<GenerateAddresses> => {
  const existingAddresses: AddressIndexMap = {};
  const newAddresses: AddressIndexMap = {};
  const allAddresses: string[] = [];

  // We currently generate only addresses in change derivation path 0
  // (more details in https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki#Change)
  // so we derive our xpub to this path and use it to get the addresses
  const derivedXpub = walletUtils.xpubDeriveChild(xpubkey, 0);

  let highestCheckedIndex = -1;
  let lastUsedAddressIndex = -1;
  do {
    const { NETWORK } = getConfig();
    console.debug('WALLET UTILS: ', walletUtils);
    const addrMap = walletUtils.getAddresses(derivedXpub, highestCheckedIndex + 1, maxGap, NETWORK);
    allAddresses.push(...Object.keys(addrMap));

    const [results] = await mysql.query(
      `SELECT \`address\`,
              \`index\`,
              \`transactions\`
         FROM \`address\`
        WHERE \`address\`
           IN (?)`,
      [Object.keys(addrMap)],
    );

    for (const entry of results) {
      const address = entry.address as string;
      // get index from addrMap as the one from entry might be null
      const index = addrMap[address];
      // add to existingAddresses
      existingAddresses[address] = index;

      // if address is used, check if its index is higher than the current highest used index
      if (entry.transactions > 0 && index > lastUsedAddressIndex) {
        lastUsedAddressIndex = index;
      }

      delete addrMap[address];
    }

    highestCheckedIndex += maxGap;
    Object.assign(newAddresses, addrMap);
  } while (lastUsedAddressIndex + maxGap > highestCheckedIndex);

  // we probably generated more addresses than needed, as we always generate
  // addresses in maxGap blocks
  const totalAddresses = lastUsedAddressIndex + maxGap + 1;
  for (const [address, index] of Object.entries(newAddresses)) {
    if (index > lastUsedAddressIndex + maxGap) {
      delete newAddresses[address];
    }
  }

  return {
    addresses: allAddresses.slice(0, totalAddresses),
    newAddresses,
    existingAddresses,
    lastUsedAddressIndex,
  };
};

/**
 * Add addresses to address table.
 *
 * @remarks
 * The addresses are added with the given walletId and 0 transactions.
 *
 * @param mysql - Database connection
 * @param walletId - The wallet id
 * @param addresses - A map of addresses and corresponding indexes
 */
export const addNewAddresses = async (
  mysql: MysqlConnection,
  walletId: string,
  addresses: AddressIndexMap,
  lastUsedAddressIndex: number,
): Promise<void> => {
  if (Object.keys(addresses).length === 0) return;
  const entries = [];
  for (const [address, index] of Object.entries(addresses)) {
    entries.push([address, index, walletId, 0]);
  }
  await mysql.query(
    `INSERT INTO \`address\`(\`address\`, \`index\`,
                             \`wallet_id\`, \`transactions\`)
     VALUES ?`,
    [entries],
  );

  // Store on the wallet table the highest used index
  await mysql.query(
    `UPDATE \`wallet\`
        SET \`last_used_address_index\` = ?
      WHERE \`id\` = ?`,
    [lastUsedAddressIndex, walletId],
  );
};

/**
 * Update a wallet's balance and tx history with a new transaction.
 *
 * @remarks
 * When a new transaction arrives, it can change the balance and tx history for the wallets. This function
 * updates the wallet_balance and wallet_tx_history tables with information from this transaction.
 *
 * @param mysql - Database connection
 * @param txId - Transaction id
 * @param timestamp - Transaction timestamp
 * @param walletBalanceMap - Map with the transaction's balance for each wallet (by walletId)
 */
export const updateWalletTablesWithTx = async (
  mysql: MysqlConnection,
  txId: string,
  timestamp: number,
  walletBalanceMap: StringMap<TokenBalanceMap>,
): Promise<void> => {
  const entries = [];
  for (const [walletId, tokenBalanceMap] of Object.entries(walletBalanceMap)) {
    for (const [token, tokenBalance] of tokenBalanceMap.iterator()) {
      // on wallet_balance table, balance cannot be negative (it's unsigned). That's why we use balance
      // as (tokenBalance < 0 ? 0 : tokenBalance). In case the wallet's balance in this tx is negative,
      // there must necessarily be an entry already and we'll fall on the ON DUPLICATE KEY case, so the
      // entry value won't be used. We'll just update balance = balance + tokenBalance
      const entry = {
        wallet_id: walletId,
        token_id: token,
        // totalAmountSent is the sum of the value of all outputs of this token on the tx being sent to this address
        // which means it is the "total_received" for this wallet
        total_received: tokenBalance.totalAmountSent,
        unlocked_balance: (tokenBalance.unlockedAmount < 0 ? 0 : tokenBalance.unlockedAmount),
        locked_balance: tokenBalance.lockedAmount,
        unlocked_authorities: tokenBalance.unlockedAuthorities.toUnsignedInteger(),
        locked_authorities: tokenBalance.lockedAuthorities.toUnsignedInteger(),
        timelock_expires: tokenBalance.lockExpires,
        transactions: 1,
      };

      // save the smaller value of timelock_expires, when not null
      await mysql.query(
        `INSERT INTO wallet_balance
            SET ?
             ON DUPLICATE KEY
         UPDATE total_received = total_received + ?,
                unlocked_balance = unlocked_balance + ?,
                locked_balance = locked_balance + ?,
                transactions = transactions + 1,
                timelock_expires = CASE WHEN timelock_expires IS NULL THEN VALUES(timelock_expires)
                                        WHEN VALUES(timelock_expires) IS NULL THEN timelock_expires
                                        ELSE LEAST(timelock_expires, VALUES(timelock_expires))
                                   END,
                unlocked_authorities = (unlocked_authorities | VALUES(unlocked_authorities)),
                locked_authorities = locked_authorities | VALUES(locked_authorities)`,
        [entry, tokenBalance.totalAmountSent, tokenBalance.unlockedAmount, tokenBalance.lockedAmount, walletId, token],
      );

      // same logic here as in the updateAddressTablesWithTx function
      if (tokenBalance.unlockedAuthorities.hasNegativeValue()) {
        // If we got here, it means that we spent an authority, so we need to update the table to refresh the current
        // value.
        // To do that, we get all unlocked_authorities from all addresses (querying by wallet and token_id) and
        // bitwise OR them with each other.
        await mysql.query(
          `UPDATE \`wallet_balance\`
              SET \`unlocked_authorities\` = (
                SELECT BIT_OR(\`unlocked_authorities\`)
                  FROM \`address_balance\`
                 WHERE \`address\` IN (
                   SELECT \`address\`
                     FROM \`address\`
                    WHERE \`wallet_id\` = ?)
                   AND \`token_id\` = ?)
            WHERE \`wallet_id\` = ?
              AND \`token_id\` = ?`,
          [walletId, token, walletId, token],
        );
      }

      entries.push([walletId, token, txId, tokenBalance.total(), timestamp]);
    }
  }

  if (entries.length > 0) {
    await mysql.query(
      `INSERT INTO \`wallet_tx_history\` (\`wallet_id\`, \`token_id\`,
                                          \`tx_id\`, \`balance\`,
                                          \`timestamp\`)
            VALUES ?`,
      [entries],
    );
  }
};

/**
 * Alias for addOrUpdateTx
 *
 * @remarks
 * This method is simply an alias for addOrUpdateTx in the current implementation.
 *
 * @param mysql - Database connection
 * @param txId - Transaction id
 * @param timestamp - The transaction timestamp
 * @param version - The transaction version
 * @param weight - The transaction weight
 */
export const updateTx = async (
  mysql: MysqlConnection,
  txId: string,
  height: number,
  timestamp: number,
  version: number,
  weight: number,
): Promise<void> => addOrUpdateTx(mysql, txId, height, timestamp, version, weight);

/**
 * Get a list of tx outputs from their spent_by txId
 *
 * @param mysql - Database connection
 * @param txIds - The list of transactions that spent the tx_outputs we are querying

 * @returns A list of tx_outputs
 */
export const getTxOutputsBySpent = async (
  mysql: MysqlConnection,
  txIds: string[],
): Promise<DbTxOutput[]> => {
  const [results] = await mysql.query<TxOutputRow[]>(
    `SELECT *
       FROM \`tx_output\`
      WHERE \`spent_by\` IN (?)`,
    [txIds],
  );

  const utxos = [];
  for (const result of results) {
    const utxo: DbTxOutput = {
      txId: result.tx_id as string,
      index: result.index as number,
      tokenId: result.token_id as string,
      address: result.address as string,
      value: result.value as number,
      authorities: result.authorities as number,
      timelock: result.timelock as number,
      heightlock: result.heightlock as number,
      locked: result.locked ? Boolean(result.locked) : false,
      txProposalId: result.tx_proposal as string,
      txProposalIndex: result.tx_proposal_index as number,
      spentBy: result.spent_by ? result.spent_by as string : null,
    };

    utxos.push(utxo);
  }

  return utxos;
};

/**
 * Set a list of tx_outputs as unspent
 *
 * @param mysql - Database connection
 * @param txOutputs - The list of tx_outputs to unspend
 */
export const unspendUtxos = async (
  mysql: MysqlConnection,
  txOutputs: DbTxOutput[],
): Promise<void> => {
  const txIdIndexList = txOutputs.map((txOutput) => [txOutput.txId, txOutput.index]);

  await mysql.query(
    `UPDATE \`tx_output\`
        SET \`spent_by\` = NULL
      WHERE (\`tx_id\`, \`index\`) IN (?)`,
    [txIdIndexList],
  );
};

/**
 * Deletes utxos from the tx_outputs table
 *
 * @param mysql - Database connection
 * @param utxos - The list of utxos to delete from the database
 */
export const markUtxosAsVoided = async (
  mysql: MysqlConnection,
  utxos: DbTxOutput[],
): Promise<void> => {
  const txIds = utxos.map((tx) => tx.txId);

  await mysql.query(`
    UPDATE \`tx_output\`
       SET \`voided\` = TRUE
     WHERE \`tx_id\` IN (?)`,
  [txIds]);
};

export const updateLastSyncedEvent = async (
  mysql: MysqlConnection,
  lastEventId: number,
): Promise<void> => {
  await mysql.query(`
     INSERT INTO \`sync_metadata\` (\`id\`, \`last_event_id\`)
          VALUES (0, ?)
ON DUPLICATE KEY
          UPDATE last_event_id = ?`,
  [lastEventId, lastEventId]);
};

export const getLastSyncedEvent = async (
  mysql: MysqlConnection,
): Promise<LastSyncedEvent | null> => {
  const [results] = await mysql.query<LastSyncedEventRow[]>(
    `SELECT * FROM \`sync_metadata\` LIMIT 1`,
    [],
  );

  if (!results.length) {
    return null;
  }

  const lastSyncedEvent: LastSyncedEvent = {
    id: results[0].id,
    last_event_id: results[0].last_event_id,
    updated_at: results[0].updated_at,
  };

  return lastSyncedEvent;
};

export const getBestBlockHeight = async (
  mysql: MysqlConnection,
): Promise<number> => {
  const [results] = await mysql.query<BestBlockRow[]>(
    `SELECT MAX(height) AS height
       FROM \`transaction\`
      LIMIT 1`,
    [],
  );

  const maxHeight = results[0].height;

  return maxHeight;
};

/**
 * Retrieves a list of `AddressBalance`s from a list of addresses
 *
 * @param mysql - Database connection
 * @param addresses - The addresses to query
 */
export const fetchAddressBalance = async (
  mysql: MysqlConnection,
  addresses: string[],
): Promise<AddressBalance[]> => {
  const [results] = await mysql.query<AddressBalanceRow[]>(
    `SELECT *
       FROM \`address_balance\`
      WHERE \`address\` IN (?)
   ORDER BY \`address\`, \`token_id\``,
    [addresses],
  );

  return results.map((result): AddressBalance => ({
    address: result.address as string,
    tokenId: result.token_id as string,
    unlockedBalance: result.unlocked_balance as number,
    lockedBalance: result.locked_balance as number,
    lockedAuthorities: result.locked_authorities as number,
    unlockedAuthorities: result.unlocked_authorities as number,
    timelockExpires: result.timelock_expires as number,
    transactions: result.transactions as number,
  }));
};

/**
 * Retrieves a list of `AddressTotalBalance`s from a list of addresses
 *
 * @param mysql - Database connection
 * @param addresses - The addresses to query
 */
export const fetchAddressTxHistorySum = async (
  mysql: MysqlConnection,
  addresses: string[],
): Promise<AddressTotalBalance[]> => {
  const [results] = await mysql.query<AddressTxHistorySumRow[]>(
    `SELECT address,
            token_id,
            SUM(\`balance\`) AS balance,
            COUNT(\`tx_id\`) AS transactions
       FROM \`address_tx_history\`
      WHERE \`address\` IN (?)
        AND \`voided\` = FALSE
   GROUP BY address, token_id
   ORDER BY address, token_id`,
    [addresses],
  );

  return results.map((result): AddressTotalBalance => ({
    address: result.address as string,
    tokenId: result.token_id as string,
    balance: parseInt(result.balance),
    transactions: parseInt(result.transactions),
  }));
};

export const getTxOutputsHeightUnlockedAtHeight = async (
  mysql: MysqlConnection,
  height: number,
): Promise<DbTxOutput[]> => {
  const [results] = await mysql.query<TxOutputRow[]>(
    `SELECT *
       FROM \`tx_output\`
      WHERE \`heightlock\` = ?
        AND \`voided\` = FALSE`,
    [height],
  );

  const utxos = [];
  for (const result of results) {
    const utxo: DbTxOutput = {
      txId: result.tx_id as string,
      index: result.index as number,
      tokenId: result.token_id as string,
      address: result.address as string,
      value: result.value as number,
      authorities: result.authorities as number,
      timelock: result.timelock as number,
      heightlock: result.heightlock as number,
      locked: result.locked ? Boolean(result.locked) : false,
      txProposalId: result.tx_proposal as string,
      txProposalIndex: result.tx_proposal_index as number,
      spentBy: result.spent_by ? result.spent_by as string : null,
    };
    utxos.push(utxo);
  }

  return utxos;
};

/**
 * Get the token information.
 *
 * @param mysql - Database connection
 * @param tokenId - The token's id
 * @returns The token information (or null if id is not found)
 */
export const getTokenInformation = async (
  mysql: MysqlConnection,
  tokenId: string,
): Promise<TokenInfo | null> => {
  const [results] = await mysql.query<TokenInformationRow[]>(
    'SELECT * FROM `token` WHERE `id` = ?',
    [tokenId],
  );

  if (results.length === 0) return null;

  return new TokenInfo(tokenId, results[0].name as string, results[0].symbol as string);
};

/**
 * Cleanup all records from a transaction that was voided in the past
 *
 * @remarks
 * This does not re-calculates balances, so it's only supposed to be used to clear
 * the tx_output, address_tx_history and wallet_tx_history tables
 *
 * @param mysql - Database connection
 * @param txId - The transaction to clear from database
 */
export const cleanupVoidedTx = async (mysql: MysqlConnection, txId: string): Promise<void> => {
  await mysql.query(
    `DELETE FROM \`transaction\`
      WHERE tx_id = ?
        AND voided = true`,
    [txId],
  );

  await mysql.query(
    `DELETE FROM \`tx_output\`
      WHERE tx_id = ?
        AND voided = true`,
    [txId],
  );

  await mysql.query(
    `DELETE FROM \`address_tx_history\`
      WHERE tx_id = ?
        AND voided = true`,
    [txId],
  );

  await mysql.query(
    `DELETE FROM \`wallet_tx_history\`
      WHERE tx_id = ?
        AND voided = true`,
    [txId],
  );
};

/**
 * Get token symbol map, correlating token id to its symbol.
 *
 * @param mysql - Database connection
 * @param tokenIdList - A list of token ids
 * @returns The token information (or null if id is not found)
 *
 * @todo This method is duplicated from the wallet-service lambdas,
 * we should have common methods for both packages
 */
export const getTokenSymbols = async (
  mysql: MysqlConnection,
  tokenIdList: string[],
): Promise<StringMap<string> | null> => {
  if (tokenIdList.length === 0) return null;

  const [results] = await mysql.query<TokenSymbolsRow[]>(
    'SELECT `id`, `symbol` FROM `token` WHERE `id` IN (?)',
    [tokenIdList],
  );

  if (results.length === 0) return null;
  return results.reduce((prev: Record<string, string>, token: { id: string, symbol: string }) => {
    // eslint-disable-next-line no-param-reassign
    prev[token.id] = token.symbol;
    return prev;
  }, {}) as unknown as StringMap<string>;
};
