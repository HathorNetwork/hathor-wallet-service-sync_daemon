import { Context, Event, FullNodeEventTypes } from '../../src/types';
import {
  metadataIgnore,
  metadataVoided,
  metadataNewTx,
  metadataFirstBlock,
  metadataChanged,
  vertexAccepted,
  invalidPeerId,
  invalidStreamId,
  websocketDisconnected,
  voided,
  unchanged,
  invalidNetwork,
} from '../../src/guards';
import { EventTypes } from '../../src/types';

jest.mock('../../src/utils', () => ({
  hashTxData: jest.fn(),
}));

import { hashTxData } from '../../src/utils';

jest.mock('../../src/config', () => {
  return {
    __esModule: true, // This property is needed for mocking a default export
    default: jest.fn(() => ({})),
  };
});

import getConfig from '../../src/config';

const TxCache = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockContext: Context = {
  socket: null,
  retryAttempt: 0,
  // @ts-ignore
  event: {},
  initialEventId: null,
  // @ts-ignore
  txCache: TxCache,
};

const generateFullNodeEvent = (type: FullNodeEventTypes, data = {} as any): Event => ({
  type: EventTypes.FULLNODE_EVENT,
  event: {
    type: 'EVENT',
    network: 'mainnet',
    peer_id: '',
    stream_id: '',
    event: {
      id: 0,
      timestamp: 0,
      type,
      data,
    },
    latest_event_id: 0,
  },
});

const generateMetadataDecidedEvent = (type: string): Event => ({
  type: EventTypes.METADATA_DECIDED,
  event: {
    type,
    // @ts-ignore
    originalEvent: {} as any,
  },
});

describe('metadata decided tests', () => {
  test('metadataIgnore', async () => {
    expect(metadataIgnore(mockContext, generateMetadataDecidedEvent('IGNORE'))).toBe(true);
    expect(metadataIgnore(mockContext, generateMetadataDecidedEvent('TX_NEW'))).toBe(false);
    expect(metadataIgnore(mockContext, generateMetadataDecidedEvent('TX_VOIDED'))).toBe(false);
    expect(metadataIgnore(mockContext, generateMetadataDecidedEvent('TX_FIRST_BLOCK'))).toBe(false);

    // Any event other than METADATA_DECIDED should throw an error:
    expect(() => metadataIgnore(mockContext, generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED))).toThrow('Invalid event type on metadataIgnore guard: FULLNODE_EVENT');
  });

  test('metadataVoided', () => {
    expect(metadataVoided(mockContext, generateMetadataDecidedEvent('TX_VOIDED'))).toBe(true);
    expect(metadataVoided(mockContext, generateMetadataDecidedEvent('IGNORE'))).toBe(false);
    expect(metadataVoided(mockContext, generateMetadataDecidedEvent('TX_NEW'))).toBe(false);
    expect(metadataVoided(mockContext, generateMetadataDecidedEvent('TX_FIRST_BLOCK'))).toBe(false);

    // Any event other than METADATA_DECIDED should return false:
    expect(() => metadataIgnore(mockContext, generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED))).toThrow('Invalid event type on metadataIgnore guard: FULLNODE_EVENT');
  });

  test('metadataNewTx', () => {
    expect(metadataNewTx(mockContext, generateMetadataDecidedEvent('TX_NEW'))).toBe(true);
    expect(metadataNewTx(mockContext, generateMetadataDecidedEvent('TX_FIRST_BLOCK'))).toBe(false);
    expect(metadataNewTx(mockContext, generateMetadataDecidedEvent('TX_VOIDED'))).toBe(false);
    expect(metadataNewTx(mockContext, generateMetadataDecidedEvent('IGNORE'))).toBe(false);

    // Any event other than METADATA_DECIDED should return false:
    expect(() => metadataIgnore(mockContext, generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED))).toThrow('Invalid event type on metadataIgnore guard: FULLNODE_EVENT');
  });

  test('metadataFirstBlock', () => {
    expect(metadataFirstBlock(mockContext, generateMetadataDecidedEvent('TX_FIRST_BLOCK'))).toBe(true);
    expect(metadataFirstBlock(mockContext, generateMetadataDecidedEvent('TX_VOIDED'))).toBe(false);
    expect(metadataFirstBlock(mockContext, generateMetadataDecidedEvent('IGNORE'))).toBe(false);
    expect(metadataFirstBlock(mockContext, generateMetadataDecidedEvent('TX_NEW'))).toBe(false);

    // Any event other than METADATA_DECIDED should return false:
    expect(() => metadataIgnore(mockContext, generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED))).toThrow('Invalid event type on metadataIgnore guard: FULLNODE_EVENT');
  });
});

describe('fullnode event guards', () => {
  test('vertexAccepted', () => {
    expect(vertexAccepted(mockContext, generateFullNodeEvent(FullNodeEventTypes.NEW_VERTEX_ACCEPTED))).toBe(true);
    expect(vertexAccepted(mockContext, generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED))).toBe(false);

    // Any event other than FULLNODE_EVENT should return false
    expect(() => vertexAccepted(mockContext, generateMetadataDecidedEvent('TX_NEW'))).toThrow('Invalid event type on vertexAccepted guard: METADATA_DECIDED');
  });

  test('metadataChanged', () => {
    expect(metadataChanged(mockContext, generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED))).toBe(true);
    expect(metadataChanged(mockContext, generateFullNodeEvent(FullNodeEventTypes.NEW_VERTEX_ACCEPTED))).toBe(false);

    // Any event other than FULLNODE_EVENT should return false
    expect(() => metadataChanged(mockContext, generateMetadataDecidedEvent('IGNORE'))).toThrow('Invalid event type on metadataChanged guard: METADATA_DECIDED');
  });

  test('voided', () => {
    const fullNodeVoidedTxEvent = generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED, {
      hash: 'tx1',
      metadata: {
        voided_by: ['tx2'],
      }
    });
    const fullNodeNotVoidedEvent = generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED, {
      hash: 'tx1',
      metadata: {
        voided_by: [],
      }
    });

    expect(voided(mockContext, fullNodeVoidedTxEvent)).toBe(true);
    expect(voided(mockContext, fullNodeNotVoidedEvent)).toBe(false);

    // Any event other than FULLNODE_EVENT should return false
    expect(() => voided(mockContext, generateMetadataDecidedEvent('TX_NEW'))).toThrow('Invalid event type on voided guard: METADATA_DECIDED');

    // Any fullndode event other VERTEX_METADATA_CHANGED and NEW_VERTEX_ACCEPTED
    // should return false
    // @ts-ignore
    expect(voided(mockContext, generateFullNodeEvent('SOMETHING_ELSE'))).toBe(false);
  });

  test('unchanged', () => {
    const fullNodeEvent = generateFullNodeEvent(FullNodeEventTypes.VERTEX_METADATA_CHANGED);

    // @ts-ignore
    TxCache.get.mockReturnValueOnce('mockedTxCache');
    // @ts-ignore
    hashTxData.mockReturnValueOnce('mockedTxCache');

    expect(unchanged(mockContext, fullNodeEvent)).toBe(true);
    // Since I only mocked the return once, this should fail on next call:
    expect(unchanged(mockContext, fullNodeEvent)).toBe(false);

    // Any event other than FULLNODE_EVENT should return false
    expect(() => unchanged(mockContext, generateMetadataDecidedEvent('TX_NEW'))).toThrow('Invalid event type on unchanged guard: METADATA_DECIDED');
  });
});

describe('fullnode validation guards', () => {
  test('invalidStreamId', () => {
    // @ts-ignore
    getConfig.mockReturnValueOnce({
      STREAM_ID: 'mockStreamId',
    });
    const fullNodeEvent = generateFullNodeEvent(FullNodeEventTypes.NEW_VERTEX_ACCEPTED);
    // @ts-ignore
    fullNodeEvent.event.stream_id = 'mockStreamId';
    expect(invalidStreamId(mockContext, fullNodeEvent)).toBe(false);
    // @ts-ignore
    fullNodeEvent.event.stream_id = 'invalidStreamId';
    expect(invalidStreamId(mockContext, fullNodeEvent)).toBe(true);
  });

  test('invalidNetwork', () => {
    // @ts-ignore
    getConfig.mockReturnValue({
      FULLNODE_NETWORK: 'mainnet',
    });
    const fullNodeEvent = generateFullNodeEvent(FullNodeEventTypes.NEW_VERTEX_ACCEPTED);
    // @ts-ignore
    fullNodeEvent.event.network = 'mainnet';
    expect(invalidNetwork(mockContext, fullNodeEvent)).toBe(false);
    // @ts-ignore
    fullNodeEvent.event.network = 'testnet';
    expect(invalidNetwork(mockContext, fullNodeEvent)).toBe(true);
  });

  test('invalidPeerId', () => {
    // @ts-ignore
    getConfig.mockReturnValueOnce({
      FULLNODE_PEER_ID: 'mockPeerId',
    });

    const fullNodeEvent = generateFullNodeEvent(FullNodeEventTypes.NEW_VERTEX_ACCEPTED);
    // @ts-ignore
    fullNodeEvent.event.peer_id = 'mockPeerId';
    expect(invalidPeerId(mockContext, fullNodeEvent)).toBe(false);
    // @ts-ignore
    fullNodeEvent.event.peer_id = 'invalidPeerId';
    expect(invalidPeerId(mockContext, fullNodeEvent)).toBe(true);
  });
});

describe('websocket guards', () => {
  test('websocketDisconnected', () => {
    const mockDisconnectedEvent: Event = {
      type: EventTypes.WEBSOCKET_EVENT,
      event: { type: 'DISCONNECTED' }
    };
    const mockConnectedEvent: Event = {
      type: EventTypes.WEBSOCKET_EVENT,
      event: { type: 'CONNECTED' }
    };

    expect(websocketDisconnected(mockContext, mockDisconnectedEvent)).toBe(true);
    expect(websocketDisconnected(mockContext, mockConnectedEvent)).toBe(false);
  });
});
