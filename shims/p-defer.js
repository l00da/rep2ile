/**
 * Metro/Hermes often breaks `import pDefer from 'p-defer'` (default export interop).
 * @libp2p/utils queue/recipient.js calls `pDefer()` — must be a real function.
 * Implementation matches sindresorhus/p-defer (MIT).
 */
export default function pDefer() {
  const deferred = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
}
