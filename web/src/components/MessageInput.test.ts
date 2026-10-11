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
const render = (disabled = false) => renderToStaticMarkup(createElement(MessageInput, { disabled, onSend: vi.fn() }));
it('renders the idle microphone next to the editable draft with a focus outline', () => {
  const html = render();
  expect(html).toContain('aria-label="Record voice message"');
  expect(html).toContain('<svg'); expect(html).toContain('focus-visible:outline');
  expect(html).toContain('w-full min-w-0'); expect(html).toContain('typed draft'); expect(html).toContain('Review it before sending.');
  expect(html).not.toContain('aria-label="Microphone level"');
});
it('renders five bounded bars outside the live status, with Stop and elapsed recording state', () => {
  state.voice = { phase: 'recording', seconds: 7 };
  const html = render();
  expect(html).toContain('>Stop</button>');
  expect(html).toContain('>Cancel</button>');
  expect(html).toContain('inert=""');
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

it('groups 44px microphone and circular arrow inside the rounded composer, after the textarea', () => {
  const html = render();
  expect(html).toContain('rounded-2xl border border-line');
  expect(html).toContain('shrink-0 items-center justify-end gap-1');
  expect(html.match(/h-11 w-11 shrink-0/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Send message"');
  expect(html).toContain('M12 19V5M5 12l7-7 7 7');
  expect(html).not.toContain('>Send</button>');
  expect(html.indexOf('</textarea>')).toBeLessThan(html.indexOf('aria-label="Record voice message"'));
  const microphone = html.split('aria-label="Record voice message"')[1].split('</button>')[0];
  expect(microphone).not.toContain('border-line');
  expect(html).toContain('max-h-48');
  expect(html).toContain('overflow-y-auto');
});
it('keeps both action buttons disabled while submitting', () => {
  const html = render(true);
  for (const label of ['Record voice message', 'Send message']) {
    expect(html.split(`aria-label="${label}"`)[1].split('</button>')[0]).toContain('disabled=""');
  }
});

it('uses one compact grid row with a one-line, borderless textarea and bounded growth', () => {
  const html = render();
  expect(html).toContain('rows="1"');
  expect(html).toContain('grid-cols-[minmax(0,1fr)_auto] items-end');
  expect(html).toContain('min-h-16');
  expect(html).not.toContain('min-h-44');
  expect(html).not.toContain('min-h-[72px]');
  const textarea = html.split('<textarea')[1].split('</textarea>')[0];
  expect(textarea).toContain('border-0 bg-transparent');
  expect(textarea).toContain('max-h-48');
  expect(html).toContain('focus-within:ring-2');
});
