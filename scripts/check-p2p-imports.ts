import {createLibp2p} from 'libp2p';
import {webSockets} from '@libp2p/websockets';
import {noise} from '@chainsafe/libp2p-noise';
import {yamux} from '@chainsafe/libp2p-yamux';
import {circuitRelayServer} from '@libp2p/circuit-relay-v2';

void createLibp2p;
void webSockets;
void noise;
void yamux;
void circuitRelayServer;

console.log('P2P imports OK');
