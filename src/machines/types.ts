export interface Context {
  socket: WebSocket | null;
  retryAttempt: number;
}

export type FullNodeEvent = {
  type: string;
  peer_id: string;
  id: number;
  timestamp: number;
  data: unknown;
}

export type WebSocketEvent = 
  | { type: 'CONNECTED'; socket: WebSocket }
  | { type: 'DISCONNECTED' };

export type Event =
  | { type: 'WEBSOCKET_EVENT', event: WebSocketEvent }
  | { type: 'FULLNODE_EVENT', event: FullNodeEvent };
