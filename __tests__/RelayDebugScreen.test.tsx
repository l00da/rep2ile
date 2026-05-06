/**
 * @format
 */

import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';

import {RelayDebugScreen} from '../src/screens/RelayDebugScreen';
import {formSampleSchema} from '../packages/protocol/schemas';
import {RelayLifecycleRecorder} from '../relay/RelayLifecycleRecorder';
import {runFixtureRelayDemo} from '../relay/runFixtureRelayDemo';

describe('RelayDebugScreen (Pass 8)', () => {
  it('renders', () => {
    render(<RelayDebugScreen />);
    expect(screen.getByTestId('relay-debug-root')).toBeTruthy();
    expect(screen.getByTestId('relay-debug-run-demo')).toBeTruthy();
  });

  it('clicking Run Fixture Demo Flow creates observations', async () => {
    render(<RelayDebugScreen />);
    fireEvent.press(screen.getByTestId('relay-debug-run-demo'));
    await waitFor(() => {
      expect(screen.getByTestId('relay-debug-step-0')).toBeTruthy();
    });
    expect(screen.getByTestId('relay-debug-json-panel')).toBeTruthy();
  });

  it('displays lifecycle order matching recorder expectations', async () => {
    render(<RelayDebugScreen />);
    const expected = RelayLifecycleRecorder.expectedEventOrder();
    for (let i = 0; i < expected.length; i += 1) {
      expect(screen.getByTestId(`relay-debug-expected-${i}`)).toHaveTextContent(
        new RegExp(expected[i]),
      );
    }
    fireEvent.press(screen.getByTestId('relay-debug-run-demo'));
    await waitFor(() => {
      expect(screen.getByTestId('relay-debug-step-4')).toBeTruthy();
    });
    expected.forEach((kind, i) => {
      expect(screen.getByTestId(`relay-debug-step-${i}`)).toHaveTextContent(
        new RegExp(kind),
      );
    });
  });

  it('payload preview is summarized (no raw keypoints / joints arrays)', async () => {
    render(<RelayDebugScreen />);
    fireEvent.press(screen.getByTestId('relay-debug-run-demo'));
    await waitFor(() => {
      expect(screen.getByTestId('relay-debug-payload-preview-0')).toBeTruthy();
    });
    const el = screen.getByTestId('relay-debug-payload-preview-0');
    const text = typeof el.props.children === 'string'
      ? el.props.children
      : String(el.props.children);
    expect(text).toMatch(/clip_uri_preview|frame_count|joint_count_per_frame/);
    expect(text).not.toMatch(/"keypoints"\s*:/);
    expect(text).not.toMatch(/"joints"\s*:/);
    expect(text).not.toMatch(/"frames"\s*:\s*\[/);
  });

  it('form_sample from fixture demo still validates', async () => {
    const {formSample} = await runFixtureRelayDemo();
    expect(() => formSampleSchema.parse(formSample)).not.toThrow();
  });
});
