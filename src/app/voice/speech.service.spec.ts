import { heardText, pickVoice } from './speech.service';

describe('heardText', () => {
  it('joins the pieces of an answer said with pauses', () => {
    expect(heardText(['one two three four', ' five six'])).toBe('one two three four five six');
  });

  it('does not repeat a piece that restates what was already heard', () => {
    expect(heardText(['one two', 'one two three', 'One two three four'])).toBe('One two three four');
  });
});

describe('pickVoice', () => {
  const voice = (lang: string, isDefault = false) => ({ lang, default: isDefault });

  it('prefers a Kenyan voice, then other English ones', () => {
    expect(pickVoice([voice('en-US'), voice('en-GB'), voice('en-KE')])?.lang).toBe('en-KE');
    expect(pickVoice([voice('fr-FR', true), voice('en_US'), voice('en-GB')])?.lang).toBe('en-GB');
  });

  it('falls back to the default voice, and to none when there are none', () => {
    expect(pickVoice([voice('fr-FR'), voice('sw-KE', true)])?.lang).toBe('sw-KE');
    expect(pickVoice([])).toBeUndefined();
  });
});
