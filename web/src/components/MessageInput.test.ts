import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageInput } from './MessageInput';
import type { VoiceState } from '../voice/recording';
const state = vi.hoisted(() => ({ voice: { phase: 'idle', seconds: 0 } as VoiceState, level: .5 }));
vi.mock('../session/AppSession', () => ({ useAppSession: () => ({ locked: false, signedIn: true, chatMode: 'temporary' }) }));
// Controlled render states only; recorder lifecycle is tested separately.
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original, useState: (initial: unknown) => [
    typeof initial === 'object' ? state.voice : typeof initial === 'number' ? state.level : 'typed draft', vi.fn(),
  ] };
});
beforeEach(() => { state.voice = { phase: 'idle', seconds: 0 }; state.level = .5; });
const render = () => renderToStaticMarkup(createElement(MessageInput, { disabled: false, onSend: vi.fn() }));
it('renders the idle microphone next to the editable draft with a focus outline', () => {
  const html = render();
  expect(html).toContain('aria-label="Start microphone recording"');
  expect(html).toContain('<svg'); expect(html).toContain('focus-visible:outline');
  expect(html).toContain('min-w-0 flex-1'); expect(html).toContain('typed draft'); expect(html).toContain('Review it before Send.');
  expect(html).not.toContain('aria-label="Microphone level"');
});
it('renders five bounded bars outside the live status, with Stop and elapsed recording state', () => {
  state.voice = { phase: 'recording', seconds: 7 };
  const html = render();
  expect(html).toContain('>Stop</button>');
  expect(html).toContain('>Cancel</button>');
  expect(html).toContain('hidden=""');
  expect(html).toContain('display:none');
  expect(html).toContain('Listening…');
  expect(html).toContain('aria-label="Microphone level"');
  expect(html.match(/style="height:/g)).toHaveLength(5);
  expect(html).toContain('motion-reduce:transition-none');
  expect(html).toContain('7s / 60s');
  const status = html.slice(html.indexOf('role="status"'));
  expect(status).not.toContain('style="height:');
  expect(status).not.toContain('7s');
});
it('hides levels during processing, shows a reduced-motion-aware spinner and retains errors', () => {
  state.voice = { phase: 'processing', seconds: 0 };
  const html = render();
  expect(html).not.toContain('aria-label="Microphone level"');
  expect(html).toContain('animate-spin motion-reduce:animate-none');
  expect(html).toContain('Transcribing…');
  expect(html).toContain('>Cancel</button>');
  expect(html).not.toContain('>Stop</button>');
  expect(html).toContain('display:none');
  state.voice = { phase: 'idle', seconds: 0, error: 'Audio could not be transcribed.' };
  const restored = render();
  expect(restored).toContain('Audio could not be transcribed.');
  expect(restored).toContain('typed draft');
  expect(restored).not.toContain('display:none');
});

it('keeps announcement independent of waveform and elapsed-time changes', () => {
  state.voice = { phase: 'recording', seconds: 1 }; state.level = .1;
  const first = render().split('role="status"')[1];
  state.voice = { phase: 'recording', seconds: 59 }; state.level = .9;
  expect(render().split('role="status"')[1]).toBe(first);
});
