/**
 * P2PAdapter — platform-agnostic interface for local radio P2P.
 *
 * ResonanceEngine talks only to this interface. The concrete
 * implementations (Android / iOS) are injected at construction time,
 * which also makes unit-testing trivially simple — no virtual mocks
 * for native modules are needed; just pass a plain mock object.
 *
 * Method semantics mirror Google Nearby Connections because that is the
 * richer / more explicit of the two underlying APIs.  The iOS adapter
 * maps MultipeerConnectivity onto this contract.
 */

export interface Subscription {
  remove(): void;
}

export interface P2PAdapter {
  // ---- advertising & discovery ----

  /** Begin broadcasting our endpointName over local radio. */
  startAdvertising(endpointName: string): Promise<void>;

  /** Begin scanning for peers that are advertising. */
  startDiscovery(): Promise<void>;

  /** Stop broadcasting (but keep discovery running). */
  stopAdvertising(): Promise<void>;

  /** Stop scanning. */
  stopDiscovery(): Promise<void>;

  /**
   * Tear down all radio activity and close every open channel.
   * Called by the Kill Switch.
   */
  stopAllEndpoints(): Promise<void>;

  // ---- connection lifecycle ----

  /**
   * Open a connection request to a discovered peer.
   * @param endpointName  Our identity string (stateCode:TempID).
   * @param endpointId    The remote peer's opaque identifier.
   */
  requestConnection(endpointName: string, endpointId: string): Promise<void>;

  /** Accept an incoming connection request. */
  acceptConnection(endpointId: string): Promise<void>;

  /** Reject an incoming connection request. */
  rejectConnection(endpointId: string): Promise<void>;

  /** Disconnect a single peer (used by PayloadValidator on cheat/bad payload). */
  disconnectFromEndpoint(endpointId: string): Promise<void>;

  // ---- data ----

  /** Send raw bytes to a connected peer. */
  sendPayload(endpointId: string, bytes: Uint8Array): Promise<void>;

  // ---- event subscriptions ----

  /** A new peer started advertising and was found by our scanner. */
  onEndpointFound(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription;

  /** A previously found peer is no longer visible. */
  onEndpointLost(cb: (endpointId: string) => void): Subscription;

  /**
   * A connection request has been initiated (either by us or by the remote
   * peer).  Both sides receive this event before the channel opens.
   */
  onConnectionInitiated(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription;

  /**
   * The connection handshake completed.
   * @param isSuccess  true = channel open, false = rejected / failed.
   */
  onConnectionResult(
    cb: (endpointId: string, isSuccess: boolean) => void,
  ): Subscription;

  /** A previously connected peer has disconnected. */
  onDisconnected(cb: (endpointId: string) => void): Subscription;

  /**
   * Raw bytes (or a file/stream marker) received from a connected peer.
   * payloadType: 1 = BYTES, 2 = FILE, 3 = STREAM.
   */
  onPayloadReceived(
    cb: (endpointId: string, payloadType: number, payload: unknown) => void,
  ): Subscription;
}
