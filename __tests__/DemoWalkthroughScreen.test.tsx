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

import {DemoWalkthroughScreen} from '../src/screens/DemoWalkthroughScreen';

describe('DemoWalkthroughScreen (Pass 11)', () => {
  it('renders', () => {
    render(<DemoWalkthroughScreen stepDelayMs={0} />);
    expect(screen.getByTestId('demo-walkthrough-root')).toBeTruthy();
    expect(screen.getByTestId('demo-run-full')).toBeTruthy();
  });

  it('Run Full Demo completes all steps and shows outputs', async () => {
    render(<DemoWalkthroughScreen stepDelayMs={0} />);

    fireEvent.press(screen.getByTestId('demo-run-full'));

    await waitFor(
      () => {
        expect(screen.getByTestId('demo-step-status-7')).toHaveTextContent(
          'complete',
        );
      },
      {timeout: 60_000},
    );

    const preview = screen.getByTestId('demo-form-sample-preview').props
      .children as string;
    expect(preview).toContain('form_sample');
    expect(preview).toContain('video_clip_manifest');

    const relay = screen.getByTestId('demo-relay-observations').props.children as string;
    expect(relay).toContain('athlete_created_form_sample');
    expect(relay).toContain('relay_forwarded_to_athlete');

    expect(screen.getByTestId('demo-coach-feedback-summary')).not.toHaveTextContent(
      '—',
    );

    expect(screen.getByTestId('skeleton-replay-frame-label')).toBeTruthy();
    expect(screen.getByTestId('skeleton-replay-frame-label')).toHaveTextContent(
      /Frame \d/,
    );
  });
});
