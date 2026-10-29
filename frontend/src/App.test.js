import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

const mockPlayback = jest.fn();
jest.mock('./Avatar', () => function Avatar(props) {
  const React = require('react');
  React.useEffect(() => {
    if (props.audioUrl) mockPlayback(props);
  }, [props.audioUrl, props.visemes]);
  return <div aria-label="Companion avatar" />;
});
jest.mock('@microsoft/teams-js', () => ({ app: { initialize: jest.fn(), getContext: jest.fn() } }), { virtual: true });

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const json = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
const healthy = () => json({ status: 'healthy' });
const reply = () => json({ response: 'A helpful reply.', audioUrl: '/audio/reply.wav', visemes: [{ timeMs: 100, visemeId: 3 }] });
const flush = async () => { await act(async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve(); }); };
const send = (text = 'My question') => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
};
const chatCalls = () => global.fetch.mock.calls.filter(([url]) => url.endsWith('/api/chat'));
let testNumber = 0;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2030, 0, 1).getTime() + testNumber++ * 10000000);
  global.fetch = jest.fn();
  mockPlayback.mockClear();
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  await act(async () => { jest.advanceTimersByTime(0); });
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('typing and one pending send survive StrictMode wakeup, then one response starts playback', async () => {
  const health = deferred();
  const chat = deferred();
  global.fetch.mockImplementation(url => url.endsWith('/health') ? health.promise : chat.promise);
  render(<StrictMode><App /></StrictMode>);
  await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Waking up the companion');
  expect(screen.getByRole('textbox')).toBeEnabled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My question' } });
  // Multiple events before React commits disabled state must share one submission.
  const sendButton = screen.getByRole('button', { name: 'Send message' });
  act(() => {
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  });
  expect(screen.getAllByText('My question')).toHaveLength(1);
  expect(chatCalls()).toHaveLength(0);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  health.resolve(healthy());
  await flush();
  expect(screen.getByRole('status')).toHaveTextContent('Thinking');
  expect(chatCalls()).toHaveLength(1);
  expect(JSON.parse(chatCalls()[0][1].body)).toMatchObject({ message: 'My question', includeAudio: true });
  chat.resolve(reply());
  await flush();
  expect(screen.getAllByText('A helpful reply.')).toHaveLength(1);
  expect(mockPlayback).toHaveBeenCalledTimes(1);
  expect(mockPlayback.mock.calls[0][0]).toMatchObject({ audioUrl: expect.stringContaining('/audio/reply.wav'), visemes: [{ timeMs: 100, visemeId: 3 }], isTalking: true });
});

test('a failed submission offers explicit retry without another user bubble or automatic inference', async () => {
  global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : json({ code: 'MODEL_UNAVAILABLE', error: 'provider-private-details', requestId: 'request-123' }, false)));
  render(<App />);
  await flush();
  send();
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent(/companion.*unavailable/i);
  expect(screen.queryByText(/provider-private-details/)).not.toBeInTheDocument();
  expect(chatCalls()).toHaveLength(1);
  expect(screen.getAllByText('My question')).toHaveLength(1);
  global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : reply()));
  fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));
  await flush();
  expect(chatCalls()).toHaveLength(2);
  expect(screen.getAllByText('My question')).toHaveLength(1);
  expect(screen.getAllByText('A helpful reply.')).toHaveLength(1);
});

test('chat deadline aborts after sixty seconds and ignores a late response', async () => {
  const chat = deferred();
  global.fetch.mockImplementation(url => url.endsWith('/health') ? Promise.resolve(healthy()) : chat.promise);
  render(<App />);
  await flush();
  send();
  await flush();
  const signal = chatCalls()[0][1].signal;
  await act(async () => { jest.advanceTimersByTime(60000); });
  await flush();
  expect(signal.aborted).toBe(true);
  expect(screen.getByRole('alert')).toHaveTextContent(/too long/i);
  chat.resolve(reply());
  await flush();
  expect(screen.queryByText('A helpful reply.')).not.toBeInTheDocument();
  expect(mockPlayback).not.toHaveBeenCalled();
});

test('unmount cancels the active chat and late completion cannot start audio', async () => {
  const chat = deferred();
  global.fetch.mockImplementation(url => url.endsWith('/health') ? Promise.resolve(healthy()) : chat.promise);
  const view = render(<App />);
  await flush();
  send();
  await flush();
  const signal = chatCalls()[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  chat.resolve(reply());
  await flush();
  expect(mockPlayback).not.toHaveBeenCalled();
});

test('focus and typing refresh stale health without periodic keepalive traffic', async () => {
  global.fetch.mockResolvedValue(healthy());
  render(<App />);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(13 * 60 * 1000); });
  fireEvent.focus(window);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(60 * 1000); });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  fireEvent.focus(window);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(2);
  await act(async () => { jest.advanceTimersByTime(14 * 60 * 1000); });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'still typing' } });
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('textbox')).toHaveValue('still typing');
});


test('readiness failure retains the submission and explicit retry sends it once after recovery', async () => {
  global.fetch.mockImplementation(() => new Promise(() => {}));
  render(<App />);
  await flush();
  send();
  await act(async () => { jest.advanceTimersByTime(90000); });
  await flush();
  expect(chatCalls()).toHaveLength(0);
  expect(screen.getByRole('alert')).toHaveTextContent(/could not connect/i);
  expect(screen.getAllByText('My question')).toHaveLength(1);
  global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : reply()));
  fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));
  await flush();
  expect(chatCalls()).toHaveLength(1);
  expect(screen.getAllByText('My question')).toHaveLength(1);
  expect(screen.getAllByText('A helpful reply.')).toHaveLength(1);
});

test('a stalled JSON body is covered by the chat deadline', async () => {
  const body = deferred();
  global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : { ok: true, status: 200, json: () => body.promise }));
  render(<App />);
  await flush();
  send();
  await flush();
  await act(async () => { jest.advanceTimersByTime(60000); });
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent(/too long/i);
  body.resolve({ response: 'Too late.', audioUrl: '/audio/late.wav', visemes: [] });
  await flush();
  expect(screen.queryByText('Too late.')).not.toBeInTheDocument();
  expect(mockPlayback).not.toHaveBeenCalled();
});

test('a hidden tab stays quiet and becoming visible refreshes stale readiness', async () => {
  global.fetch.mockResolvedValue(healthy());
  render(<App />);
  await flush();
  const visibility = jest.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  await act(async () => { jest.advanceTimersByTime(14 * 60 * 1000); });
  fireEvent(document, new Event('visibilitychange'));
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('unmount while waking cancels readiness and never posts the pending message', async () => {
  const health = deferred();
  global.fetch.mockReturnValue(health.promise);
  const view = render(<App />);
  await flush();
  send();
  const signal = global.fetch.mock.calls[0][1].signal;
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(0); });
  await flush();
  expect(signal.aborted).toBe(true);
  health.resolve(healthy());
  await flush();
  expect(chatCalls()).toHaveLength(0);
  expect(mockPlayback).not.toHaveBeenCalled();
});

test.each([
  ['CONFIGURATION_ERROR', /unavailable/i],
  ['RATE_LIMITED', /busy/i],
  ['AI_TIMEOUT', /too long/i],
  ['AI_UNAVAILABLE', /could not reply/i],
  ['EMPTY_RESPONSE', /could not finish/i],
  ['SPEECH_TIMEOUT', /voice response took too long/i],
  ['SPEECH_UNAVAILABLE', /voice response is unavailable/i],
  ['INVALID_REQUEST', /message could not be sent/i],
  ['INTERNAL_ERROR', /something went wrong/i],
  ['constructor', /could not reply/i],
])('maps %s to a friendly message without exposing provider details', async (code, expected) => {
  global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : json({ success: false, code, error: 'Sensitive provider details', message: 'Raw provider message', requestId: 'request-123' }, false)));
  render(<App />);
  await flush();
  send();
  await flush();
  expect(screen.getByRole('alert')).toHaveTextContent(expected);
  expect(screen.queryByText(/Sensitive provider|Raw provider/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry message' })).toBeEnabled();
  expect(chatCalls()).toHaveLength(1);
});

test('malformed visemes do not mark an already appended assistant reply as failed', async () => {
  global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : json({ response: 'A helpful reply.', audioUrl: '/audio/reply.wav', visemes: [null] })));
  render(<App />);
  await flush();
  send();
  await flush();
  expect(screen.getAllByText('A helpful reply.')).toHaveLength(1);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry message' })).not.toBeInTheDocument();
  expect(mockPlayback).not.toHaveBeenCalled();
});

test('a late audio-context resume cannot allocate timers after unmount', async () => {
  const resume = deferred();
  const originalContext = window.AudioContext;
  const close = jest.fn().mockResolvedValue();
  window.AudioContext = jest.fn(() => ({ state: 'suspended', resume: () => resume.promise, close }));
  try {
    global.fetch.mockImplementation(url => url.endsWith('/health') ? Promise.resolve(healthy()) : new Promise(() => {}));
    const view = render(<App />);
    await flush();
    send();
    await flush();
    view.unmount();
    await act(async () => { jest.advanceTimersByTime(0); });
    expect(close).toHaveBeenCalledTimes(1);
    resume.resolve();
    await flush();
    jest.runAllTicks();
    expect(close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    window.AudioContext = originalContext;
  }
});

test('repeated canplaythrough events play each silent unlock source once and release resources', async () => {
  const playback = deferred();
  const temporaryAudio = [];
  const originalContext = window.AudioContext;
  const close = jest.fn().mockResolvedValue();
  window.AudioContext = jest.fn(() => ({ state: 'running', close }));
  jest.spyOn(window, 'Audio').mockImplementation(() => {
    const audio = { load: jest.fn(), play: jest.fn(() => playback.promise), pause: jest.fn(), removeAttribute: jest.fn() };
    temporaryAudio.push(audio);
    return audio;
  });
  try {
    global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : reply()));
    const view = render(<App />);
    await flush();
    send();
    await flush();
    expect(temporaryAudio).toHaveLength(2);
    const readyCallbacks = temporaryAudio.map(audio => audio.oncanplaythrough);
    act(() => {
      for (let i = 0; i < 5; i += 1) readyCallbacks.forEach(callback => callback());
      jest.advanceTimersByTime(100);
    });
    temporaryAudio.forEach(audio => {
      expect(audio.load.mock.calls.length).toBeLessThanOrEqual(1);
      expect(audio.play).toHaveBeenCalledTimes(1);
    });
    playback.resolve();
    await flush();
    temporaryAudio.forEach(audio => {
      expect(audio.oncanplaythrough).toBeNull();
      expect(audio.onerror).toBeNull();
      expect(audio.pause).toHaveBeenCalledTimes(1);
      expect(audio.removeAttribute).toHaveBeenCalledWith('src');
    });
    expect(close).toHaveBeenCalledTimes(1);
    act(() => {
      readyCallbacks.forEach(callback => callback());
      jest.advanceTimersByTime(2000);
    });
    await flush();
    temporaryAudio.forEach(audio => expect(audio.play).toHaveBeenCalledTimes(1));
    expect(close).toHaveBeenCalledTimes(1);
    view.unmount();
    await flush();
    jest.runAllTicks();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    window.AudioContext = originalContext;
  }
});

test('unmount releases silent audio and closes its context even when play is still pending', async () => {
  const playback = deferred();
  const temporaryAudio = [];
  const originalContext = window.AudioContext;
  const close = jest.fn().mockResolvedValue();
  window.AudioContext = jest.fn(() => ({ state: 'running', close }));
  jest.spyOn(window, 'Audio').mockImplementation(() => {
    const audio = { load: jest.fn(), play: jest.fn(() => playback.promise), pause: jest.fn(), removeAttribute: jest.fn() };
    temporaryAudio.push(audio);
    return audio;
  });
  try {
    global.fetch.mockImplementation(url => url.endsWith('/health') ? Promise.resolve(healthy()) : new Promise(() => {}));
    const view = render(<App />);
    await flush();
    send();
    await act(async () => { jest.advanceTimersByTime(100); });
    const readyCallbacks = temporaryAudio.map(audio => audio.oncanplaythrough);
    view.unmount();
    expect(close).toHaveBeenCalledTimes(1);
    temporaryAudio.forEach(audio => {
      expect(audio.oncanplaythrough).toBeNull();
      expect(audio.onerror).toBeNull();
      expect(audio.pause).toHaveBeenCalledTimes(1);
    });
    playback.resolve();
    act(() => { readyCallbacks.forEach(callback => callback()); });
    await flush();
    jest.runAllTicks();
    temporaryAudio.forEach(audio => expect(audio.play).toHaveBeenCalledTimes(1));
    expect(close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    window.AudioContext = originalContext;
  }
});


test('silent playback rejection settles through the bounded fallback and releases resources', async () => {
  const temporaryAudio = [];
  const originalContext = window.AudioContext;
  const close = jest.fn().mockResolvedValue();
  window.AudioContext = jest.fn(() => ({ state: 'running', close }));
  jest.spyOn(window, 'Audio').mockImplementation(() => {
    const audio = { load: jest.fn(), play: jest.fn().mockRejectedValue(new Error('Playback unavailable')), pause: jest.fn(), removeAttribute: jest.fn() };
    temporaryAudio.push(audio);
    return audio;
  });
  try {
    global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : reply()));
    const view = render(<App />);
    await flush();
    send();
    await flush();
    await act(async () => { jest.advanceTimersByTime(100); });
    await flush();
    expect(close).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1400); });
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    temporaryAudio.forEach(audio => {
      expect(audio.play).toHaveBeenCalledTimes(1);
      expect(audio.pause).toHaveBeenCalledTimes(1);
      expect(audio.oncanplaythrough).toBeNull();
      expect(audio.removeAttribute).toHaveBeenCalledWith('src');
    });
    view.unmount();
    await flush();
    jest.runAllTicks();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    window.AudioContext = originalContext;
  }
});

test.each([0, 5000])('resizing from desktop to mobile at %sms keeps the same avatar without replaying audio', async elapsed => {
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1686 });
  try {
    global.fetch.mockImplementation(url => Promise.resolve(url.endsWith('/health') ? healthy() : reply()));
    render(<App />);
    await flush();
    send();
    await flush();
    expect(mockPlayback).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(elapsed); });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    fireEvent(window, new Event('resize'));
    await act(async () => { jest.advanceTimersByTime(100); });
    await flush();
    expect(screen.getByRole('textbox')).toBeEnabled();
    expect(screen.getByText('A helpful reply.')).toBeInTheDocument();
    expect(mockPlayback).toHaveBeenCalledTimes(1);
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  }
});
