/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/node/createMobileNode.js', () => ({
  createMobileNode: jest.fn(() => ({
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    getPeerId: jest.fn(() => 'mock-peer-id'),
    publishWorkoutSummary: jest.fn(async () => {}),
  })),
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
