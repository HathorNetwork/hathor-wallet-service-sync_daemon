import { Event, Context, FullNodeEvent } from '../machines/types';
import {
  TxOutputWithIndex,
  StringMap,
  TokenBalanceMap,
  Transaction,
  TxInput,
  Wallet,
  DbTxOutput
} from '../types';
import {
  prepareOutputs,
  getAddressBalanceMap,
  hashTxData,
  getUnixTimestamp,
  unlockUtxos,
  unlockTimelockedUtxos,
  prepareInputs,
  markLockedOutputs,
  getTokenListFromInputsAndOutputs,
  getWalletBalanceMap,
  validateAddressBalances,
} from '../utils';
// @ts-ignore
import hathorLib from '@hathor/wallet-lib';
import {
  getDbConnection,
  addOrUpdateTx,
  addUtxos,
  updateTxOutputSpentBy,
  updateAddressTablesWithTx,
  getTransactionById,
  getUtxosLockedAtHeight,
  addMiner,
  storeTokenInformation,
  getLockedUtxoFromInputs,
  incrementTokensTxCount,
  getAddressWalletInfo,
  generateAddresses,
  addNewAddresses,
  updateWalletTablesWithTx,
  voidTransaction,
  updateLastSyncedEvent as dbUpdateLastSyncedEvent,
  getLastSyncedEvent,
  getTxOutputsFromTx,
  getTxOutputsAtHeight,
  markUtxosAsVoided,
  getTxOutputsHeightUnlockedAtHeight,
} from '../db';
import { TxCache } from '../machines';
import logger from '../logger';

export const metadataDiff = async (_context: Context, event: Event) => {
  const mysql = await getDbConnection();

  try {
    const fullNodeEvent = event.event as FullNodeEvent;
    const hash = fullNodeEvent.event.data.hash;
    const eventId = fullNodeEvent.event.id;
    const dbTx: Transaction | null = await getTransactionById(mysql, fullNodeEvent.event.data.hash);

    if (!dbTx) {
      if (fullNodeEvent.event.data.metadata.voided_by.length > 0) {
        // No need to add voided transactions
        return {
          type: 'IGNORE',
          originalEvent: event,
        };
      }
      return {
        type: 'TX_NEW',
        originalEvent: event,
      };
    }

    if (fullNodeEvent.event.data.metadata.voided_by.length > 0) {
      if (!dbTx.voided) {
        return {
          type: 'TX_VOIDED',
          originalEvent: event,
        };
      }

      return {
        type: 'IGNORE',
        originalEvent: event,
      };
    }

    // TODO: Handle the case where the transaction was voided and is not anymore.
    if (fullNodeEvent.event.data.metadata.voided_by.length > 0) {
      if (!dbTx.voided) {
        return {
          type: 'TX_VOIDED',
          originalEvent: event,
        };
      }
    }

    if (fullNodeEvent.event.data.metadata.first_block
       && fullNodeEvent.event.data.metadata.first_block.length
       && fullNodeEvent.event.data.metadata.first_block.length > 0) {

      if (!dbTx.height) {
        return {
          type: 'TX_FIRST_BLOCK',
          originalEvent: event,
        };
      }

      return {
        type: 'IGNORE',
        originalEvent: event,
      };
    }

    return {
      type: 'IGNORE',
      originalEvent: event,
    };
  } catch(e) {
    console.error('e', e);
    return Promise.reject(e);
  } finally {
    mysql.destroy();
  }
};

export const isBlock = (version: number): boolean => {
  return version === hathorLib.constants.BLOCK_VERSION
      || version === hathorLib.constants.MERGED_MINED_BLOCK_VERSION;
};

export const handleVertexAccepted = async (context: Context, _event: Event) => {
  const mysql = await getDbConnection();
  try {
    const fullNodeEvent = context.event as FullNodeEvent;
    const now = getUnixTimestamp();
    const blockRewardLock = parseInt(process.env.BLOCK_REWARD_LOCK || '10', 10);

    // @ts-ignore
    const {
      hash,
      metadata,
      timestamp,
      version,
      weight,
      outputs,
      inputs,
      tokens,
      token_name,
      token_symbol,
    } = fullNodeEvent.event.data;

    let height: number | null = metadata.height;

    if (!isBlock(version) && !metadata.first_block) {
      height = null;
    }

    const txOutputs: TxOutputWithIndex[] = prepareOutputs(outputs, tokens);
    const txInputs: TxInput[] = prepareInputs(inputs, tokens);

    let heightlock = null;
    if (isBlock(version)) {
      if (typeof height !== 'number' && !height) {
        throw new Error('Block with no height set in metadata.');
      }
      // unlock older blocks
      const utxos = await getUtxosLockedAtHeight(mysql, now, height);

      if (utxos.length > 0) {
        logger.info(`Block transaction, unlocking ${utxos.length} locked utxos at height ${height}`);
        await unlockUtxos(mysql, utxos, false);
      }

      // set heightlock
      heightlock = height + blockRewardLock;

      // get the first output address
      const blockRewardOutput = outputs[0];

      // add miner to the miners table
      // @ts-ignore
      await addMiner(mysql, blockRewardOutput.decoded.address, hash);

      // here we check if we have any utxos on our database that is locked but
      // has its timelock < now
      //
      // we've decided to do this here considering that it is acceptable to have
      // a delay between the actual timelock expiration time and the next block
      // (that will unlock it). This delay is only perceived on the wallet as the
      // sync mechanism will unlock the timelocked utxos as soon as they are seen
      // on a received transaction.
      await unlockTimelockedUtxos(mysql, now);
    }


    if (version === hathorLib.constants.CREATE_TOKEN_TX_VERSION
       && token_name
       && token_symbol) {
      if (!token_name || !token_symbol) {
        console.error('Processed a token creation event but it did not come with token name and symbol');
        process.exit(1);
      }
      await storeTokenInformation(mysql, hash, token_name, token_symbol);
    }

    // check if any of the inputs are still marked as locked and update tables accordingly.
    // See remarks on getLockedUtxoFromInputs for more explanation. It's important to perform this
    // before updating the balances
    const lockedInputs = await getLockedUtxoFromInputs(mysql, inputs);
    await unlockUtxos(mysql, lockedInputs, true);

    // add transaction outputs to the tx_outputs table
    markLockedOutputs(txOutputs, now, heightlock !== null);

    // Add the transaction
    logger.info('Will add the tx with height', height);
    await addOrUpdateTx(
      mysql,
      hash,
      height,
      timestamp,
      version,
      weight,
    );

    // Add utxos
    await addUtxos(mysql, hash, txOutputs, heightlock);
    await updateTxOutputSpentBy(mysql, txInputs, hash);

    // Handle genesis parent txs:
    if (inputs.length > 0 || outputs.length > 0)  {
      const tokenList: string[] = getTokenListFromInputsAndOutputs(txInputs, txOutputs);

      // Update transaction count with the new tx
      await incrementTokensTxCount(mysql, tokenList);

      const addressBalanceMap: StringMap<TokenBalanceMap> = getAddressBalanceMap(txInputs, txOutputs);

      // update address tables (address, address_balance, address_tx_history)
      await updateAddressTablesWithTx(mysql, hash, timestamp, addressBalanceMap);

      // for the addresses present on the tx, check if there are any wallets associated
      const addressWalletMap: StringMap<Wallet> = await getAddressWalletInfo(mysql, Object.keys(addressBalanceMap));

      // for each already started wallet, update databases
      const seenWallets = new Set();
      for (const wallet of Object.values(addressWalletMap)) {
        const walletId = wallet.walletId;

        // this map might contain duplicate wallet values, as 2 different addresses might belong to the same wallet
        if (seenWallets.has(walletId)) continue;
        seenWallets.add(walletId);
        const { newAddresses, lastUsedAddressIndex } = await generateAddresses(mysql, wallet.xpubkey, wallet.maxGap);
        // might need to generate new addresses to keep maxGap
        await addNewAddresses(mysql, walletId, newAddresses, lastUsedAddressIndex);
        // update existing addresses' walletId and index
      }
      // update wallet_balance and wallet_tx_history tables
      const walletBalanceMap: StringMap<TokenBalanceMap> = getWalletBalanceMap(addressWalletMap, addressBalanceMap);
      await updateWalletTablesWithTx(mysql, hash, timestamp, walletBalanceMap);
    }

    // @ts-ignore
    const hashedTxData = hashTxData(fullNodeEvent.event.data.metadata);

    // TODO: Send message on SQS  for real-time update
    TxCache.set(hash, hashedTxData);

    await dbUpdateLastSyncedEvent(mysql, fullNodeEvent.event.id);

    await mysql.end();
  } catch(e) {
    logger.error(e);

    throw e;
  } finally {
    mysql.destroy();
  }
};

export const handleVoidedTx = async (context: Context) => {
  const mysql = await getDbConnection();

  try {
    const fullNodeEvent = context.event as FullNodeEvent;

    const {
      hash,
      outputs,
      inputs,
      tokens,
    } = fullNodeEvent.event.data;

    const dbTxOutputs: DbTxOutput[] = await getTxOutputsFromTx(mysql, hash);
    const txOutputs: TxOutputWithIndex[] = prepareOutputs(outputs, tokens);
    const txInputs: TxInput[] = prepareInputs(inputs, tokens);

    // Set outputs as locked:

    const txOutputsWithLocked = txOutputs.map((output) => {
      const dbTxOutput = dbTxOutputs.find((_output) => _output.index === output.index);

      if (!dbTxOutput) {
        throw new Error('Transaction output different from database output!');
      }

      return {
        ...output,
        locked: dbTxOutput.locked,
      };
    });

    const addressBalanceMap: StringMap<TokenBalanceMap> = getAddressBalanceMap(txInputs, txOutputsWithLocked);
    await voidTransaction(mysql, hash, addressBalanceMap);
    await markUtxosAsVoided(mysql, dbTxOutputs);

    const addresses = Object.keys(addressBalanceMap);
    await validateAddressBalances(mysql, addresses);

    await dbUpdateLastSyncedEvent(mysql, fullNodeEvent.event.id);

    logger.info(`Voided tx ${hash}`);
  } catch(e) {
    logger.info(e);

    return Promise.reject(e);
  } finally {
    mysql.destroy();
  }
};

export const handleTxFirstBlock = async (context: Context) => {
  const mysql = await getDbConnection();

  try {
    const fullNodeEvent = context.event as FullNodeEvent;

    const {
      hash,
      metadata,
      timestamp,
      version,
      weight,
    } = fullNodeEvent.event.data;

    let height: number | null = metadata.height;

    if (!metadata.first_block) {
      height = null;
    }

    await addOrUpdateTx(mysql, hash, height, timestamp, version, weight);
    await dbUpdateLastSyncedEvent(mysql, fullNodeEvent.event.id);
    logger.info(`Confirmed tx ${hash}`);
  } catch (e) {
    console.error('E: ', e);
    return Promise.reject(e);
  } finally {
    mysql.destroy();
  }
};

export const updateLastSyncedEvent = async (context: Context) => {
  const mysql = await getDbConnection();
  // @ts-ignore
  const lastEventId = context.event.event.id;
  await dbUpdateLastSyncedEvent(mysql, lastEventId);

  mysql.destroy();
};

export const fetchInitialState = async () => {
  const mysql = await getDbConnection();
  const lastEvent = await getLastSyncedEvent(mysql);

  mysql.destroy();

  return { lastEventId: lastEvent?.last_event_id };
};