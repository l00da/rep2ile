/**
 * IOSMultipeerAdapter — verifies the mapping from P2PAdapter interface
 * to react-native-multipeer-connectivity method calls, and verifies
 * the inviter-side onConnectionInitiated simulation.
 */

const mockSubs: Record<string, jest.Mock> = {};

jest.mock(
  'react-native-multipeer-connectivity',
  () => ({
    __esModule: true,
    default: {
      advertise: jest.fn(),
      browse: jest.fn(),
      stopAdvertising: jest.fn(),
      stopBrowsing: jest.fn(),
      disconnect: jest.fn(),
      invite: jest.fn(),
      send: jest.fn(),
      addListener: jest.fn().mockImplementation((event: string, cb: jest.Mock) => {
        mockSubs[event] = cb;
        return { remove: jest.fn() };
      }),
    },
  }),
  { virtual: true },
);

import Multipeer from 'react-native-multipeer-connectivity';
import { IOSMultipeerAdapter } from '../../../src/p2p/adapters/IOSMultipeerAdapter';

describe('IOSMultipeerAdapter', () => {
  let adapter: IOSMultipeerAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockSubs).forEach((k) => delete mockSubs[k]);
    adapter = new IOSMultipeerAdapter();
  });

  // ---- advertising / discovery ----

  it('startAdvertising calls Multipeer.advertise with SERVICE_TYPE and discoveryInfo', async () => {
    await adapter.startAdvertising('0:my-uuid');
    expect(Multipeer.advertise).toHaveBeenCalledWith({
      serviceType: 'reptile-p2p',
      discoveryInfo: { n: '0:my-uuid' },
    });
  });

  it('startDiscovery calls Multipeer.browse with SERVICE_TYPE', async () => {
    await adapter.startDiscovery();
    expect(Multipeer.browse).toHaveBeenCalledWith({ serviceType: 'reptile-p2p' });
  });

  it('stopAllEndpoints stops advertising, browsing, and disconnects', async () => {
    await adapter.stopAllEndpoints();
    expect(Multipeer.stopAdvertising).toHaveBeenCalled();
    expect(Multipeer.stopBrowsing).toHaveBeenCalled();
    expect(Multipeer.disconnect).toHaveBeenCalled();
  });

  // ---- peer discovery events ----

  it('onEndpointFound fires callback with peer.id and discoveryInfo["n"]', () => {
    const cb = jest.fn();
    adapter.onEndpointFound(cb);
    mockSubs['peer.found']({ id: 'peer1' }, { n: '0:abc-uuid' });
    expect(cb).toHaveBeenCalledWith('peer1', '0:abc-uuid');
  });

  it('onEndpointLost fires callback with peer.id', () => {
    const cb = jest.fn();
    adapter.onEndpointLost(cb);
    mockSubs['peer.lost']({ id: 'peer1' });
    expect(cb).toHaveBeenCalledWith('peer1');
  });

  // ---- invitation flow ----

  it('onConnectionInitiated fires for the INVITEE via the "invite" event', () => {
    const cb = jest.fn();
    adapter.onConnectionInitiated(cb);

    const accept = jest.fn();
    const decline = jest.fn();
    mockSubs['invite']({ id: 'peer1' }, '1:their-uuid', accept, decline);

    expect(cb).toHaveBeenCalledWith('peer1', '1:their-uuid');
  });

  it('acceptConnection calls the stored accept callback for an invitee', async () => {
    const accept = jest.fn();
    adapter.onConnectionInitiated(jest.fn());
    mockSubs['invite']({ id: 'peer1' }, '1:uuid', accept, jest.fn());

    await adapter.acceptConnection('peer1');
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('rejectConnection calls the stored decline callback', async () => {
    const decline = jest.fn();
    adapter.onConnectionInitiated(jest.fn());
    mockSubs['invite']({ id: 'peer1' }, '1:uuid', jest.fn(), decline);

    await adapter.rejectConnection('peer1');
    expect(decline).toHaveBeenCalledTimes(1);
  });

  it('requestConnection calls Multipeer.invite and fires onConnectionInitiated for INVITER', async () => {
    const initiated = jest.fn();
    adapter.onConnectionInitiated(initiated);

    await adapter.requestConnection('1:my-uuid', 'peer2');

    expect(Multipeer.invite).toHaveBeenCalledWith({ id: 'peer2' }, '1:my-uuid', 30);
    // Simulated event for the inviter side
    expect(initiated).toHaveBeenCalledWith('peer2', '1:my-uuid');
  });

  it('acceptConnection is a no-op for the INVITER (no stored callback)', async () => {
    await expect(adapter.acceptConnection('peer-no-invite')).resolves.not.toThrow();
  });

  // ---- connection result ----

  it('onConnectionResult fires with isSuccess=true on peer.connected', () => {
    const cb = jest.fn();
    adapter.onConnectionResult(cb);
    mockSubs['peer.connected']({ id: 'peer1' });
    expect(cb).toHaveBeenCalledWith('peer1', true);
  });

  it('onConnectionResult fires with isSuccess=false on peer.disconnected', () => {
    const cb = jest.fn();
    adapter.onConnectionResult(cb);
    mockSubs['peer.disconnected']({ id: 'peer1' });
    expect(cb).toHaveBeenCalledWith('peer1', false);
  });

  it('onDisconnected fires on peer.disconnected', () => {
    const cb = jest.fn();
    adapter.onDisconnected(cb);
    mockSubs['peer.disconnected']({ id: 'peer1' });
    expect(cb).toHaveBeenCalledWith('peer1');
  });

  // ---- payload ----

  it('sendPayload calls Multipeer.send with a Buffer', async () => {
    const bytes = new Uint8Array([72, 105]);
    await adapter.sendPayload('peer1', bytes);
    expect(Multipeer.send).toHaveBeenCalledWith(
      [{ id: 'peer1' }],
      Buffer.from(bytes),
      true,
    );
  });

  it('onPayloadReceived converts Buffer to Uint8Array with payloadType=1', () => {
    const cb = jest.fn();
    adapter.onPayloadReceived(cb);
    const buf = Buffer.from([1, 2, 3]);
    mockSubs['data']({ id: 'peer1' }, buf);
    expect(cb).toHaveBeenCalledWith('peer1', 1, new Uint8Array(buf));
  });
});
