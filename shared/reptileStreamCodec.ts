import {
  coachAnalysisResultSchema,
  formSampleSchema,
  type CoachAnalysisResult,
  type FormSample,
} from '../packages/protocol/schemas.ts';

type StreamLike = {
  source: AsyncIterable<Uint8Array>;
  sink: (source: AsyncIterable<Uint8Array>) => Promise<void>;
};

const LENGTH_PREFIX_BYTES = 4;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function coerceChunk(chunk: Uint8Array | {subarray: (start?: number, end?: number) => Uint8Array}): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  return chunk.subarray();
}

function resolveStreamLike(stream: unknown): StreamLike {
  const direct = stream as Partial<StreamLike>;
  if (typeof direct?.sink === 'function' && direct?.source != null) {
    return direct as StreamLike;
  }

  const iterableOnly = stream as {[Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>};
  if (typeof iterableOnly?.[Symbol.asyncIterator] === 'function') {
    return {
      source: stream as AsyncIterable<Uint8Array>,
      sink: async () => {
        throw new Error('Provided stream is read-only and does not expose sink/write methods');
      },
    };
  }

  const messageStream = stream as {
    send?: (chunk: Uint8Array) => boolean;
    onDrain?: () => Promise<void>;
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
  };
  if (
    typeof messageStream?.send === 'function' &&
    typeof messageStream?.[Symbol.asyncIterator] === 'function'
  ) {
    return {
      source: {
        [Symbol.asyncIterator]: () => messageStream[Symbol.asyncIterator]!(),
      },
      sink: async (source: AsyncIterable<Uint8Array>) => {
        for await (const chunk of source) {
          const canSendMore = messageStream.send!(chunk);
          if (!canSendMore && typeof messageStream.onDrain === 'function') {
            await messageStream.onDrain();
          }
        }
      },
    };
  }

  const nested = (stream as {stream?: unknown})?.stream as Partial<StreamLike> | undefined;
  if (typeof nested?.sink === 'function' && nested?.source != null) {
    return nested as StreamLike;
  }

  const directKeys = stream != null && typeof stream === 'object' ? Object.keys(stream as Record<string, unknown>) : [];
  const nestedKeys =
    nested != null && typeof nested === 'object'
      ? Object.keys(nested as Record<string, unknown>)
      : [];
  throw new Error(
    `Provided stream does not expose a libp2p-compatible source/sink (keys=${directKeys.join(
      ',',
    )}; nestedKeys=${nestedKeys.join(',')})`,
  );
}

async function createFrameReader(source: AsyncIterable<Uint8Array>) {
  const iterator = source[Symbol.asyncIterator]();
  let buffered = new Uint8Array(0);

  async function readExact(size: number): Promise<Uint8Array> {
    const pieces: Uint8Array[] = [];
    let remaining = size;

    if (buffered.byteLength > 0) {
      const fromBuffered = buffered.subarray(0, remaining);
      pieces.push(fromBuffered);
      remaining -= fromBuffered.byteLength;
      buffered = buffered.subarray(fromBuffered.byteLength);
    }

    while (remaining > 0) {
      const next = await iterator.next();
      if (next.done) {
        throw new Error(`Stream ended before ${size} bytes were read`);
      }
      const chunk = coerceChunk(next.value);
      if (chunk.byteLength <= remaining) {
        pieces.push(chunk);
        remaining -= chunk.byteLength;
        continue;
      }

      pieces.push(chunk.subarray(0, remaining));
      buffered = chunk.subarray(remaining);
      remaining = 0;
    }

    return concatBytes(pieces);
  }

  return {readExact};
}

/**
 * Frame format:
 * - 4-byte unsigned big-endian payload length
 * - UTF-8 JSON payload bytes
 *
 * The length prefix prevents accidental dependence on chunk boundaries and
 * guarantees that partial reads cannot be treated as a complete JSON message.
 */
export async function writeJsonToStream(stream: StreamLike, value: unknown): Promise<void> {
  const payload = textEncoder.encode(JSON.stringify(value));
  const frame = new Uint8Array(LENGTH_PREFIX_BYTES + payload.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, payload.byteLength, false);
  frame.set(payload, LENGTH_PREFIX_BYTES);

  const messageStream = stream as {
    send?: (chunk: Uint8Array) => boolean;
    onDrain?: () => Promise<void>;
  };
  if (typeof messageStream.send === 'function') {
    const canSendMore = messageStream.send(frame);
    if (!canSendMore && typeof messageStream.onDrain === 'function') {
      await messageStream.onDrain();
    }
    return;
  }

  const target = resolveStreamLike(stream);
  await target.sink(
    (async function* frameGenerator() {
      yield frame;
    })(),
  );
}

export async function readJsonFromStream(stream: StreamLike): Promise<unknown> {
  const target = resolveStreamLike(stream);
  const reader = await createFrameReader(target.source);
  const lengthBytes = await reader.readExact(LENGTH_PREFIX_BYTES);
  const view = new DataView(
    lengthBytes.buffer,
    lengthBytes.byteOffset,
    lengthBytes.byteLength,
  );
  const payloadLength = view.getUint32(0, false);
  const payload = await reader.readExact(payloadLength);
  const decoded = textDecoder.decode(payload);
  return JSON.parse(decoded);
}

export async function parseFormSampleFromStream(stream: StreamLike): Promise<FormSample> {
  const parsed = await readJsonFromStream(stream);
  return formSampleSchema.parse(parsed);
}

export async function parseCoachAnalysisResultFromStream(
  stream: StreamLike,
): Promise<CoachAnalysisResult> {
  const parsed = await readJsonFromStream(stream);
  return coachAnalysisResultSchema.parse(parsed);
}
