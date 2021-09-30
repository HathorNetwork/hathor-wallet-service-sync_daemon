import { FullBlock, FullTx, Block, RawTxResponse } from '../src/types';

export const MOCK_TXS = [
  '0000018b4b08ad8668a42af30185e4ff228b5d2afc41ce7ee5cb7a085342ffda',
  '000001517136ab420446a80b212715160c4693deabfa72d1f2e99683fdcb845e',
  '0000018b4b08ad8668a42af30185e4ff228b5d2afc41ce7ee5cb7a085342ffda',
  '00000154ac4fac94eaeafbecdca8d7e10e23953dd8250b0b154e5d2a31abc641',
  '006358e9e1e2b22c0658f3f14a315cd8c10ef2fd5c12b6cf3be64557a90f5bd3',
  '0034557890ad299a2d683459132c0b09aba219e9aac67fbd31028432594022d7',
  '0000018b4b08ad8668a42af30185e4ff228b5d2afc41ce7ee5cb7a085342ffda',
];

export interface DecodedScript {
  type: string;
  address: string;
  timelock?: number;
}

export const MOCK_FULL_TXS: FullTx[] = [
  {
    txId: '0000000033a3bb347e0401d85a70b38f0aa7b5e37ea4c70d7dacf8e493946e64',
    nonce: '2553516830',
    timestamp: 1615397872,
    version: 1,
    weight: 17.52710175798647,
    parents: [
      '00000000d016d0d677b533b37efd958ecfa1feefa123721240e55d1dac499f1a',
      '00000000911bc85c571d8d671f202ae6ac4d50043800e72672ccb65e925853a3',
    ],
    inputs: [
      {
        value: 500,
        tokenData: 1,
        script: 'dqkU57viZuQ/P/Az3VqVQ9pxVi58uAmIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'HTeRZ6LksptwhxT1xxBuC8DxHWmpycHMEW',
          timelock: null,
          value: 500,
          tokenData: 1,
        },
        txId:
          '000000005b7069bf187363f79df0b14763b60a9ead153a9eab51cdaf5b6283ec',
        index: 1,
      },
    ],
    outputs: [
      {
        value: 475,
        tokenData: 1,
        script: 'dqkUi2Jrejdrx0C6QW/osvQNIqltHFmIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'HKE8DLbXXbMAjvMAfkZRLAC16CaoCY38we',
          timelock: null,
          value: 475,
          tokenData: 1,
        },
      },
      {
        value: 25,
        tokenData: 1,
        script: 'dqkUCXfQI6LZVe5cqOy274Aoolf6Q7SIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'H7PBzpvKSBjAhoWVwiAKJVgJr9ZKy2QhpS',
          timelock: null,
          value: 25,
          tokenData: 1,
        },
      },
    ],
    tokens: [
      {
        uid: '00000000f76262bb1cca969d952ac2f0e85f88ec34c31f26a13eb3c31e29d4ed',
        name: 'Cathor',
        symbol: 'CTHOR',
      },
    ],
  },
];

export const generateBlock = (txId: string, height: number): Block => {
  return {
    txId,
    height,
  };
};

export const OUR_BEST_BLOCK_API_RESPONSE = {
  success: true,
  tx: {
    hash: '0000018b4b08ad8668a42af30185e4ff228b5d2afc41ce7ee5cb7a085342ffda',
    nonce: '326066',
    timestamp: 1617745066,
    version: 0,
    weight: 23.09092323788272,
    parents: [
      '00000154ac4fac94eaeafbecdca8d7e10e23953dd8250b0b154e5d2a31abc641',
      '006358e9e1e2b22c0658f3f14a315cd8c10ef2fd5c12b6cf3be64557a90f5bd3',
      '0034557890ad299a2d683459132c0b09aba219e9aac67fbd31028432594022d7',
    ],
    inputs: [],
    outputs: [],
    tokens: [],
    data: '',
    height: 646026,
  },
  meta: {
    hash: '0000018b4b08ad8668a42af30185e4ff228b5d2afc41ce7ee5cb7a085342ffda',
    spent_outputs: [],
    received_by: [],
    children: [
      '000000f4016a7402c71b772ad0bf91505d4083cb48723995bb3917d7cd0dd7cd',
    ],
    conflict_with: [],
    voided_by: [],
    twins: [],
    accumulated_weight: 23.09092323788272,
    score: 44.90233102099014,
    height: 646026,
    first_block: null,
    validation: 'full',
  },
  spent_outputs: {},
};

export const OUR_BEST_BLOCK_API_RESPONSE_VOIDED = {
  success: true,
  tx: {
    hash: '0000018b4b08ad8668a42af30185e4ff228b5d2afc41ce7ee5cb7a085342ffda',
    nonce: '326066',
    timestamp: 1617745066,
    version: 0,
    weight: 23.09092323788272,
    parents: [
      '00000154ac4fac94eaeafbecdca8d7e10e23953dd8250b0b154e5d2a31abc641',
      '006358e9e1e2b22c0658f3f14a315cd8c10ef2fd5c12b6cf3be64557a90f5bd3',
      '0034557890ad299a2d683459132c0b09aba219e9aac67fbd31028432594022d7',
    ],
    inputs: [],
    outputs: [],
    tokens: [],
    data: '',
    height: 646026,
  },
  meta: {
    hash: '0000018b4b08ad8668a42af30185e4ff228b5d2afc41ce7ee5cb7a085342ffda',
    spent_outputs: [],
    received_by: [],
    children: [
      '000000f4016a7402c71b772ad0bf91505d4083cb48723995bb3917d7cd0dd7cd',
    ],
    conflict_with: [],
    voided_by: [
      '000000f4016a7402c71b772ad0bf91505d4083cb48723995bb3917d7cd0dd7cd',
    ],
    twins: [],
    accumulated_weight: 23.09092323788272,
    score: 44.90233102099014,
    height: 646026,
    first_block: null,
    validation: 'full',
  },
  spent_outputs: {},
};

export const BLOCK_BY_HEIGHT: FullBlock = {
  txId: '0000000f1fbb4bd8a8e71735af832be210ac9a6c1e2081b21faeea3c0f5797f7',
  version: 0,
  weight: 21.0,
  timestamp: 1596605949,
  inputs: [],
  outputs: [
    {
      value: 6400,
      tokenData: 0,
      script: 'dqkUtneiAsjMwg/3ZaeJ/+i3kw0zZCWIrA==',
      decoded: {
        type: 'P2PKH',
        address: 'WfJqB5SNHnkwXCCGLMBVPcwuVr94hq1oKH',
        timelock: null,
      },
      token: '00',
    },
  ],
  parents: [
    '000005cbcb8b29f74446a260cd7d36fab3cba1295ac9fe904795d7b064e0e53c',
    '00975897028ceb037307327c953f5e7ad4d3f42402d71bd3d11ecb63ac39f01a',
    '00e161a6b0bee1781ea9300680913fb76fd0fac4acab527cd9626cc1514abdc9',
  ],
  height: 3,
};

export const MOCK_CREATE_TOKEN_TX: RawTxResponse = {
  success: true,
  tx: {
    hash: '0035db82f5993097515d5bcc9e869700d538332e017c7ff599c47f659ab63d42',
    nonce: '180',
    timestamp: 1620266110,
    version: 2,
    weight: 8.000001,
    parents: [
      '00504c97802cc199e2e418aefdafd1a627fdc4cf6fc9e4198b916c2456bbb203',
      '0063b3ec31f8ffe0ebcb465e6c1111e1e9700926ac4d504c74b74b1af9cc6aad',
    ],
    inputs: [
      {
        value: 1,
        token_data: 0,
        script: 'dqkURCVU2U54vCcmN8UVMeIBKQ+ldayIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'WUtMYoi96nNVgf6i3Rq3GuvJkYsbkx3KDi',
          timelock: null,
          value: 1,
          token_data: 2,
        },
        tx_id:
          '00504c97802cc199e2e418aefdafd1a627fdc4cf6fc9e4198b916c2456bbb203',
        index: 1,
      },
    ],
    outputs: [
      {
        value: 100,
        token_data: 1,
        script: 'dqkU1vXqQItRBKC9TwophPs9I5reNnOIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'WiGe5TRjhAsrYP2dxp1zsgvYZqcBjXdWmy',
          timelock: null,
          value: 100,
          token_data: 1,
        },
      },
      {
        value: 1,
        token_data: 129,
        script: 'dqkUvKVTGtZCXV/Wmwxsdc47FUnf8f6IrA==',
        decoded: {
          type: 'P2PKH',
          address: 'WfsVxwxZhrfKHSYCeqPubQkWaeBcWZJ1ox',
          timelock: null,
          value: 1,
          token_data: 129,
        },
      },
      {
        value: 2,
        token_data: 129,
        script: 'dqkU6v6yo/94Z55pVSHPv+gTJWLln22IrA==',
        decoded: {
          type: 'P2PKH',
          address: 'Wk6a7Xif6qYsprSzFmFhVXYrgQdqg7h1K6',
          timelock: null,
          value: 2,
          token_data: 129,
        },
      },
    ],
    tokens: [
      {
        uid: '0035db82f5993097515d5bcc9e869700d538332e017c7ff599c47f659ab63d42',
        name: 'XCoin',
        symbol: 'XCN',
      },
      {
        uid: '00',
        name: null,
        symbol: null,
      },
    ],
    token_name: 'XCoin',
    token_symbol: 'XCN',
    raw: '',
  },
  meta: {
    hash: '0035db82f5993097515d5bcc9e869700d538332e017c7ff599c47f659ab63d42',
    spent_outputs: [
      [0, []],
      [1, []],
      [2, []],
    ],
    received_by: [],
    children: [],
    conflict_with: [],
    voided_by: [],
    twins: [],
    accumulated_weight: 25.78875940418488,
    score: 0.0,
    height: 0,
    first_block:
      '000000bd45ecc5119963cc3fa03e894f574e69811eef266ed7c6a0d4c1e1806c',
  },
  spent_outputs: {},
};

export const MOCK_NFT_TX: RawTxResponse = {
  success: true,
  tx: {
    hash: '0055c424b9038b0a8888b574ccdb1933a007fdfc15b91a4b38a48cc883b540bf',
    nonce: '389',
    timestamp: 1626187098,
    version: 2,
    weight: 8.0,
    parents: [
      '0055b20066e8168ad8f05e82d66a34d19970cfb1861281735215cdd84744d842',
      '00bb42880bd1183ce34df2185d1431f531a0a95af3556e368fa72e462edf7a9f',
    ],
    inputs: [
      {
        value: 2,
        token_data: 0,
        script: 'dqkU8uf1ieRE8taN5bCNug5z5UHMO6eIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'WkpQH9t4ue4LbTQKAEWssiXnYHC8CyMp7J',
          timelock: null,
          value: 2,
          token_data: 0,
        },
        tx_id:
          '0055b20066e8168ad8f05e82d66a34d19970cfb1861281735215cdd84744d842',
        index: 1,
      },
    ],
    outputs: [
      {
        value: 1,
        token_data: 0,
        script:
          'TFFodHRwczovL2lwZnMuaW8vaXBmcy9RbWJIdEZrWWlGSG5XdEV6bm01RFFHTVNOSmdwTExXeDdRNlBxdHAxb0NiQlpwL21ldGFkYXRhLmpzb26s',
        decoded: {},
      },
      {
        value: 2,
        token_data: 129,
        script: 'dqkUYpULlr3iJ6sZbP3YIfgL52fasneIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'WXfHeaEtr3fS9ex42V5chr2jY7wb5tdcWD',
          timelock: null,
          value: 2,
          token_data: 129,
        },
      },
      {
        value: 1,
        token_data: 1,
        script: 'dqkUYpULlr3iJ6sZbP3YIfgL52fasneIrA==',
        decoded: {
          type: 'P2PKH',
          address: 'WXfHeaEtr3fS9ex42V5chr2jY7wb5tdcWD',
          timelock: null,
          value: 1,
          token_data: 1,
        },
      },
    ],
    tokens: [
      {
        uid: '0055c424b9038b0a8888b574ccdb1933a007fdfc15b91a4b38a48cc883b540bf',
        name: 'Furia Special Edition',
        symbol: 'DPL9',
      },
    ],
    token_name: 'Furia Special Edition',
    token_symbol: 'DPL9',
    raw:
      '000201030055b20066e8168ad8f05e82d66a34d19970cfb1861281735215cdd84744d8420100694630440220692c2a95bbb335729520bc1717d9b6da7361ebfc5fb500e6ac45ed4243b4912202201980930659406e06a0f0117a9eb01a29f06faaebf9e4ec58cc96941681043a2e21020377708f22ac1e829c9cfbfd891bb99a47f460bf45d71f4841db404cbefdcb93000000010000544c5168747470733a2f2f697066732e696f2f697066732f516d624874466b596946486e5774457a6e6d354451474d534e4a67704c4c577837513650717470316f4362425a702f6d657461646174612e6a736f6eac0000000281001976a91462950b96bde227ab196cfdd821f80be767dab27788ac0000000101001976a91462950b96bde227ab196cfdd821f80be767dab27788ac01154675726961205370656369616c2045646974696f6e0444504c39402000000000000060eda55a020055b20066e8168ad8f05e82d66a34d19970cfb1861281735215cdd84744d84200bb42880bd1183ce34df2185d1431f531a0a95af3556e368fa72e462edf7a9f00000185',
  },
  meta: {
    hash: '0055c424b9038b0a8888b574ccdb1933a007fdfc15b91a4b38a48cc883b540bf',
    spent_outputs: [
      [0, []],
      [1, []],
      [2, []],
    ],
    received_by: [],
    children: [],
    conflict_with: [],
    voided_by: [],
    twins: [],
    accumulated_weight: 8.0,
    score: 0,
    height: 0,
    first_block:
      '000000b17b22dd27fb1205a1f810a2c4d40de1e20af140e001529642c4b173a1',
    validation: 'full',
  },
  spent_outputs: {},
};
