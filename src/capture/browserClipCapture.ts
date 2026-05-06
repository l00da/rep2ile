/**
 * Optional browser camera capture (MediaRecorder). React Native / Node has no
 * `navigator.mediaDevices` — callers should fall back to timer-based metadata.
 * Packet must never include raw video; only duration + dimensions are returned.
 */

export type BrowserClipCaptureStopResult = {
  durationMs: number;
  width: number;
  height: number;
};

export type BrowserClipCaptureHandle = {
  stop: () => Promise<BrowserClipCaptureStopResult | null>;
};

export async function tryStartBrowserClipCapture(): Promise<BrowserClipCaptureHandle | null> {
  const g = globalThis as typeof globalThis & {
    MediaRecorder?: new (stream: MediaStream) => {
      state: string;
      start: () => void;
      stop: () => void;
      addEventListener: (
        type: string,
        listener: () => void,
      ) => void;
    };
    navigator?: {
      mediaDevices?: {
        getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
      };
    };
  };

  if (
    typeof g.navigator === 'undefined' ||
    typeof g.navigator.mediaDevices?.getUserMedia !== 'function' ||
    typeof g.MediaRecorder === 'undefined'
  ) {
    return null;
  }

  try {
    const stream = await g.navigator.mediaDevices.getUserMedia({
      video: {facingMode: 'user'},
      audio: false,
    } as never);
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach(t => {
        t.stop();
      });
      return null;
    }
    const settings =
      typeof track?.getSettings === 'function' ? track.getSettings() : {};
    const width =
      typeof settings.width === 'number' && settings.width > 0
        ? settings.width
        : 640;
    const height =
      typeof settings.height === 'number' && settings.height > 0
        ? settings.height
        : 480;

    const Recorder = g.MediaRecorder;
    const recorder = new Recorder(stream);
    const startWallMs = Date.now();

    let doneResolve: (v: BrowserClipCaptureStopResult | null) => void;
    const done = new Promise<BrowserClipCaptureStopResult | null>(resolve => {
      doneResolve = resolve;
    });

    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach(t => {
        t.stop();
      });
      const durationMs = Math.max(0, Date.now() - startWallMs);
      doneResolve({durationMs, width, height});
    });

    recorder.start();

    return {
      stop: async () => {
        if (recorder.state === 'inactive') {
          return null;
        }
        recorder.stop();
        return done;
      },
    };
  } catch {
    return null;
  }
}
