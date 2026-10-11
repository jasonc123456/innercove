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
beforeEach(() => { state.voice = { phase: 'idle', seconds: 0 }; });
const render = () => renderToStaticMarkup(createElement(MessageInput, { disabled: false, onSend: vi.fn() }));
it('renders the idle microphone next to the editable draft with a focus outline', () => {
  const html = render();
  expect(html).toContain('aria-label="Start microphone recording"');
  expect(html).toContain('<svg'); expect(html).toContain('focus-visible:outline');
  expect(html).toContain('typed draft'); expect(html).toContain('Review it before Send.');
  expect(html).not.toContain('aria-label="Microphone level"');
});
it('renders five bounded bars outside the live status, with Stop and elapsed recording state', () => {
  state.voice = { phase: 'recording', seconds: 7 };
  const html = render();
  expect(html).toContain('aria-label="Stop recording"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-label="Microphone level"');
  expect(html.match(/style="height:/g)).toHaveLength(5);
  expect(html).toContain('motion-reduce:transition-none');
  expect(html).toContain('Recording 7s / 60s');
  const status = html.slice(html.indexOf('role="status"'));
  expect(status).not.toContain('style="height:');
});
it('hides levels during processing, shows a reduced-motion-aware spinner and retains errors', () => {
  state.voice = { phase: 'processing', seconds: 0 };
  const html = render();
  expect(html).not.toContain('aria-label="Microphone level"');
  expect(html).toContain('animate-spin motion-reduce:animate-none');
  expect(html).toContain('Transcribing locally');
  state.voice = { phase: 'idle', seconds: 0, error: 'Audio could not be transcribed.' };
  expect(render()).toContain('Audio could not be transcribed.');
});
