/**
 * @format
 */

import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import {AthleteCaptureScreen} from '../src/screens/AthleteCaptureScreen';

describe('AthleteCaptureScreen (Pass 9)', () => {
  it('renders', () => {
    render(<AthleteCaptureScreen />);
    expect(screen.getByTestId('athlete-capture-root')).toBeTruthy();
    expect(screen.getByTestId('athlete-capture-gen-manifest')).toBeTruthy();
  });

  it(
    'full compose flow validates Zod',
    async () => {
    render(<AthleteCaptureScreen />);

    fireEvent.press(screen.getByTestId('athlete-capture-gen-manifest'));
    fireEvent.press(screen.getByTestId('athlete-capture-gen-imu'));

    fireEvent.press(screen.getByTestId('athlete-capture-gen-pose2d'));

    await waitFor(
      () => {
        expect(screen.getByTestId('athlete-capture-pose-ready')).toBeTruthy();
      },
      {timeout: 15000},
    );

    fireEvent.press(screen.getByTestId('athlete-capture-compose'));

    await waitFor(() => {
      const json = screen.getByTestId('athlete-capture-json-preview').props
        .children as string;
      expect(json).toContain('"message_type"');
      expect(json).toContain('form_sample');
    });

    fireEvent.press(screen.getByTestId('athlete-capture-validate'));

    await waitFor(() => {
      expect(
        screen.getByTestId('athlete-capture-validation-status'),
      ).toHaveTextContent(/OK — Zod validation passed/);
    });
  },
  30_000,
  );
});
