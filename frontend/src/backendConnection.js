const connections = new Map();
const FRESH_FOR_MS = 14 * 60 * 1000;
const DEADLINE_MS = 90000;
const ATTEMPT_MS = 25000;
const RETRY_DELAY_MS = 2000;

function connectionError(code, name = 'Error') {
  const error = new Error(code);
  error.code = code;
  error.name = name;
  return error;
}

// Both the request and its JSON body are bounded, even if fetch ignores abort.
function checkHealth(url, operation) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const finish = (callback, value) => {
      clearTimeout(timer);
      operation.controller.signal.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => {
      controller.abort();
      finish(reject, operation.cancelReason);
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(reject, connectionError('ATTEMPT_TIMEOUT'));
    }, Math.min(ATTEMPT_MS, Math.max(0, operation.deadline - Date.now())));
    operation.controller.signal.addEventListener('abort', abort, { once: true });
    if (operation.controller.signal.aborted) {
      abort();
      return;
    }
    Promise.resolve().then(() => fetch(`${url}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })).then(async response => {
      if (!response.ok) throw connectionError('UNHEALTHY_RESPONSE');
      const data = await response.json();
      if (data?.status !== 'healthy') throw connectionError('UNHEALTHY_RESPONSE');
    }).then(() => finish(resolve), error => finish(reject, error));
  });
}

function waitToRetry(operation) {
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      operation.controller.signal.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => finish(reject, operation.cancelReason);
    const timer = setTimeout(() => finish(resolve), Math.min(RETRY_DELAY_MS, Math.max(0, operation.deadline - Date.now())));
    operation.controller.signal.addEventListener('abort', abort, { once: true });
    if (operation.controller.signal.aborted) abort();
  });
}

function createConnection(url) {
  const listeners = new Set();
  let snapshot = { status: 'idle' };
  let readyAt = null;
  let inFlight = null;
  let cleanupTimer = null;

  const publish = next => {
    snapshot = next;
    listeners.forEach(listener => listener(snapshot));
  };

  const ensureReady = () => {
    if (inFlight) return inFlight.promise;
    if (readyAt !== null && Date.now() - readyAt < FRESH_FOR_MS) return Promise.resolve(snapshot);

    const started = Date.now();
    const operation = { controller: new AbortController(), deadline: started + DEADLINE_MS };
    let resolveReady;
    let rejectReady;
    operation.promise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    inFlight = operation;
    publish({ status: 'waking' });
    const deadlineTimer = setTimeout(() => {
      operation.cancelReason = connectionError('CONNECTION_TIMEOUT');
      operation.controller.abort();
    }, DEADLINE_MS);

    const wake = async () => {
      while (!operation.controller.signal.aborted) {
        try {
          await checkHealth(url, operation);
          if (operation.controller.signal.aborted) throw operation.cancelReason;
          return { status: 'ready', readinessMs: Date.now() - started };
        } catch (error) {
          if (operation.controller.signal.aborted) throw operation.cancelReason;
          await waitToRetry(operation);
        }
      }
      throw operation.cancelReason;
    };

    const finish = () => {
      clearTimeout(deadlineTimer);
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
      if (inFlight === operation) inFlight = null;
    };
    wake().then(result => {
      finish();
      readyAt = Date.now();
      publish(result);
      resolveReady(result);
    }, error => {
      finish();
      publish({ status: error.name === 'AbortError' ? 'idle' : 'error' });
      rejectReady(error);
    });
    return operation.promise;
  };

  return {
    ensureReady,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size || !inFlight) return;
        // StrictMode's immediate resubscription keeps the same wake request.
        cleanupTimer = setTimeout(() => {
          cleanupTimer = null;
          if (!listeners.size && inFlight) {
            inFlight.cancelReason = connectionError('CONNECTION_CANCELLED', 'AbortError');
            inFlight.controller.abort();
          }
        }, 0);
      };
    },
  };
}

export function getBackendConnection(backendUrl) {
  const url = backendUrl.replace(/\/+$/, '');
  if (!connections.has(url)) connections.set(url, createConnection(url));
  return connections.get(url);
}
