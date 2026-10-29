import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import Avatar from './Avatar';

const mockInputWrites = [];
jest.mock('@rive-app/react-canvas', () => {
  const React = require('react');
  return {
    useRive: () => {
      const instance = React.useRef(null);
      if (!instance.current) {
        const rive = { disposed: false, inputs: {} };
        ['numViseme', 'IsSpeaking'].forEach(name => {
          let value = 0;
          rive.inputs[name] = {
            get value() {
              if (rive.disposed) throw new TypeError('Cannot read properties of null');
              return value;
            },
            set value(next) {
              // Rive deletes the native runtime input in its own earlier cleanup.
              if (rive.disposed) throw new TypeError("Cannot set properties of null (setting 'value')");
              value = next;
              mockInputWrites.push({ name, value: next });
            },
          };
        });
        instance.current = { rive, RiveComponent: () => <canvas aria-label="Rive avatar" /> };
      }
      React.useEffect(() => () => { instance.current.rive.disposed = true; }, []);
      return instance.current;
    },
    useStateMachineInput: (rive, machine, name) => rive.inputs[name],
  };
});

const flush = async () => { await act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); }); };
const props = { isActive: true, isTalking: false, isThinking: false, audioUrl: 'https://audio.example/reply.wav', visemes: [{ timeMs: 0, visemeId: 0 }, { timeMs: 100, visemeId: 3 }] };
let audioElements;
let frames;
let nextFrame;
let playback;

beforeEach(() => {
  audioElements = [];
  frames = new Map();
  nextFrame = 0;
  playback = Promise.resolve();
  mockInputWrites.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
  jest.spyOn(window, 'Audio').mockImplementation(() => {
    const audio = new EventTarget();
    audio.currentTime = 0;
    audio.duration = 1;
    audio.paused = true;
    audio.ended = false;
    audio.load = jest.fn();
    audio.pause = jest.fn(() => { audio.paused = true; });
    audio.play = jest.fn(() => { audio.paused = false; return playback; });
    audioElements.push(audio);
    return audio;
  });
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test('cleanup after completed audio never writes to an input already disposed by Rive', async () => {
  const view = render(<Avatar {...props} />);
  const audio = audioElements[0];
  act(() => { audio.dispatchEvent(new Event('canplaythrough')); });
  await flush();
  audio.ended = true;
  act(() => { audio.dispatchEvent(new Event('ended')); });
  expect(() => view.unmount()).not.toThrow();
});

test('cleanup cancels the animation frame and late events cannot touch disposed inputs', async () => {
  const view = render(<Avatar {...props} />);
  const audio = audioElements[0];
  act(() => { audio.dispatchEvent(new Event('canplaythrough')); });
  await flush();
  const scheduledFrame = [...frames.values()][0];
  view.unmount();
  expect(frames.size).toBe(0);
  const writesAtUnmount = mockInputWrites.length;
  expect(() => {
    scheduledFrame();
    audio.dispatchEvent(new Event('ended'));
    audio.dispatchEvent(new Event('error'));
    audio.dispatchEvent(new Event('canplaythrough'));
  }).not.toThrow();
  expect(mockInputWrites).toHaveLength(writesAtUnmount);
  expect(audio.play).toHaveBeenCalledTimes(1);
});

test('a play promise resolving after unmount cannot schedule animation or write Rive inputs', async () => {
  let finishPlayback;
  playback = new Promise(resolve => { finishPlayback = resolve; });
  const view = render(<Avatar {...props} />);
  const audio = audioElements[0];
  act(() => { audio.dispatchEvent(new Event('canplaythrough')); });
  view.unmount();
  const writesAtUnmount = mockInputWrites.length;
  finishPlayback();
  await flush();
  expect(frames.size).toBe(0);
  expect(mockInputWrites).toHaveLength(writesAtUnmount);
});

test('repeated audio readiness events start one playback and one animation loop', async () => {
  const view = render(<Avatar {...props} />);
  const audio = audioElements[0];
  act(() => {
    audio.dispatchEvent(new Event('canplaythrough'));
    audio.dispatchEvent(new Event('canplaythrough'));
    audio.dispatchEvent(new Event('canplaythrough'));
  });
  await flush();
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(1);
  view.unmount();
});

test('active playback still drives the authored viseme timing and returns to neutral on end', async () => {
  const view = render(<Avatar {...props} />);
  const audio = audioElements[0];
  act(() => { audio.dispatchEvent(new Event('canplaythrough')); });
  await flush();
  expect(mockInputWrites).toContainEqual({ name: 'IsSpeaking', value: true });
  const [frameId, callback] = [...frames.entries()][0];
  frames.delete(frameId);
  audio.currentTime = 0.15;
  act(() => { callback(); });
  expect(mockInputWrites).toContainEqual({ name: 'numViseme', value: 3 });
  audio.ended = true;
  act(() => { audio.dispatchEvent(new Event('ended')); });
  expect(mockInputWrites).toContainEqual({ name: 'IsSpeaking', value: false });
  expect(mockInputWrites.filter(write => write.name === 'numViseme').slice(-1)).toEqual([{ name: 'numViseme', value: 0 }]);
  expect(frames.size).toBe(0);
  view.unmount();
});
