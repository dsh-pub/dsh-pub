import { describe, expect, it } from 'vitest';

import {
  adsTxtBody,
  isAdSenseClientId,
  normalizeAdSenseClientId,
  normalizeAdSenseSlotId,
} from './adsense.js';

describe('adsense helpers', () => {
  it('accepts a ca-pub client id and rejects malformed values', () => {
    expect(normalizeAdSenseClientId('ca-pub-7584943302476161')).toBe('ca-pub-7584943302476161');
    expect(normalizeAdSenseClientId('  ca-pub-7584943302476161  ')).toBe('ca-pub-7584943302476161');
    expect(isAdSenseClientId('ca-pub-7584943302476161')).toBe(true);
    expect(normalizeAdSenseClientId('G-NCRVRTNZEX')).toBeUndefined();
    expect(normalizeAdSenseClientId('pub-7584943302476161')).toBeUndefined();
    expect(normalizeAdSenseClientId('')).toBeUndefined();
    expect(isAdSenseClientId(undefined)).toBe(false);
  });

  it('accepts numeric AdSense slot ids only', () => {
    expect(normalizeAdSenseSlotId('1234567890')).toBe('1234567890');
    expect(normalizeAdSenseSlotId(' 9876543210 ')).toBe('9876543210');
    expect(normalizeAdSenseSlotId('slot-1')).toBeUndefined();
    expect(normalizeAdSenseSlotId('')).toBeUndefined();
  });

  it('renders the canonical ads.txt line for a client id', () => {
    expect(adsTxtBody('ca-pub-7584943302476161')).toBe(
      'google.com, pub-7584943302476161, DIRECT, f08c47fec0942fa0\n',
    );
  });
});
