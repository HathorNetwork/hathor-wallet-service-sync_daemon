/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import AWS from 'aws-sdk';
import logger from '../logger';
import { PreparedTx, ApiResponse, Block } from '../types';

AWS.config.update({
  region: process.env.AWS_REGION,
});

/**
 * Calls a function from the wallet-service lambda
 *
 * @param fnName - The lambda function name
 * @param payload - The payload to be sent
 */
export const lambdaCall = (fnName: string, payload: any): Promise<any> =>
  new Promise((resolve, reject) => {
    const lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      endpoint:
        process.env.WALLET_SERVICE_STAGE === 'local'
          ? process.env.WALLET_SERVICE_LOCAL_URL || 'http://localhost:3002'
          : `https://lambda.${process.env.AWS_REGION}.amazonaws.com`,
    });

    const params = {
      FunctionName: `${process.env.WALLET_SERVICE_NAME}-${process.env.WALLET_SERVICE_STAGE}-${fnName}`,
      Payload: JSON.stringify({
        body: payload,
      }),
    };

    lambda.invoke(params, (err, data) => {
      if (err) {
        logger.error(
          `Erroed on ${fnName} method call with payload: ${payload}`
        );
        logger.error(err);
        reject(err);
      } else {
        if (data.StatusCode !== 200) {
          reject(new Error('Request failed.'));
        }

        try {
          const responsePayload = JSON.parse(data.Payload as string);
          const body = JSON.parse(responsePayload.body);

          resolve(body);
        } catch (e) {
          logger.error(
            `Erroed on lambda call to ${fnName} with payload: ${JSON.stringify(
              payload
            )}`
          );
          logger.error(e);

          return reject(e.message);
        }
      }
    });
  });

/**
 * Calls the onHandleReorgRequest lambda function
 */
export const invokeReorg = async (): Promise<ApiResponse> =>
  lambdaCall('onHandleReorgRequest', {});

/**
 * Calls the onNewTxRequest lambda function with a PreparedTx
 *
 * @param tx - The prepared transaction to be sent
 */
export const sendTx = async (tx: PreparedTx): Promise<ApiResponse> =>
  lambdaCall('onNewTxRequest', tx);

/**
 * Calls the getLatestBlock lambda function from the wallet-service returning
 * a typed `Block`.
 */
export const getWalletServiceBestBlock = async (): Promise<Block> => {
  const response = await lambdaCall('getLatestBlock', {});
  const bestBlock: Block = response.block;

  return bestBlock;
};
