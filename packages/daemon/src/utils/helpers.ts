/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

 import { StringMap } from '../types';

export function stringMapIterator<T>(stringMap: StringMap<T>): [string, T][] {
  return Object.entries(stringMap);
}