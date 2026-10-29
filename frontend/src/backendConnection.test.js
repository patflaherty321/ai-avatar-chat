import { getBackendConnection } from './backendConnection';

const healthy = () => ({ ok: true, status: 200, json: async () => ({ status: 'healthy' }) });
const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
const advance = async (ms) => { jest.advanceTimersByTime(ms); await settle(); };
let urlIndex = 0;
const connection = () => getBackendConnection(`https://backend-${urlIndex += 1}.example`);

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  global.fetch = jest.fn();
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('validates health immediately and reuses fresh readiness without periodic traffic', async () => {
  fetch.mockResolvedValue(healthy());
  const backend = connection();
  await expect(backend.ensureReady()).resolves.toMatchObject({ status: 'ready' });
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/health$/), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(backend.getSnapshot().status).toBe('ready');
  await advance(13 * 60 * 1000);
  await backend.ensureReady();
  expect(fetch).toHaveBeenCalledTimes(1);
  await advance(60 * 1000);
  expect(fetch).toHaveBeenCalledTimes(1);
  await backend.ensureReady();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

test('shares one in-flight health request between concurrent callers and StrictMode resubscriptions', async () => {
  let finish;
  fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const backend = connection();
  const unsubscribe = backend.subscribe(jest.fn());
  const first = backend.ensureReady();
  unsubscribe();
  const secondUnsubscribe = backend.subscribe(jest.fn());
  const second = backend.ensureReady();
  expect(first).toBe(second);
  await advance(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
  finish(healthy());
  await first;
  secondUnsubscribe();
  await advance(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('retries 503, HTML, and offline responses until valid healthy JSON arrives', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ status: 'healthy' }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML'); } })
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(healthy());
  const backend = connection();
  const ready = backend.ensureReady();
  await settle();
  for (let i = 0; i < 3; i += 1) await advance(2000);
  await expect(ready).resolves.toMatchObject({ status: 'ready' });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(jest.getTimerCount()).toBe(0);
});

test('keeps waking through a 60 second cold start', async () => {
  const started = Date.now();
  fetch.mockImplementation(async () => Date.now() - started >= 60000 ? healthy() : { ok: false, status: 503 });
  const backend = connection();
  const ready = backend.ensureReady();
  await settle();
  for (let i = 0; i < 29; i += 1) await advance(2000);
  expect(backend.getSnapshot().status).toBe('waking');
  await advance(2000);
  await expect(ready).resolves.toMatchObject({ status: 'ready', readinessMs: 60000 });
  expect(jest.getTimerCount()).toBe(0);
});

test('limits a hanging attempt including JSON body to 25 seconds', async () => {
  fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => new Promise(() => {}) }).mockResolvedValue(healthy());
  const backend = connection();
  const ready = backend.ensureReady();
  await settle();
  await advance(24999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  await advance(2000);
  await expect(ready).resolves.toMatchObject({ status: 'ready' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

test('fails at the total 90 second deadline even when fetch ignores abort', async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const backend = connection();
  const result = backend.ensureReady().catch(error => error);
  for (let i = 0; i < 45; i += 1) await advance(2000);
  expect(await result).toMatchObject({ code: 'CONNECTION_TIMEOUT' });
  expect(backend.getSnapshot().status).toBe('error');
  expect(fetch.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('last unsubscribe aborts work and settles callers without leaving timers', async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const backend = connection();
  const unsubscribe = backend.subscribe(jest.fn());
  const result = backend.ensureReady().catch(error => error);
  unsubscribe();
  await advance(0);
  expect(await result).toMatchObject({ name: 'AbortError' });
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(backend.getSnapshot().status).toBe('idle');
  expect(jest.getTimerCount()).toBe(0);
});
