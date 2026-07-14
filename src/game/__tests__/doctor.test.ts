import { describe, expect, it } from 'vitest';
import type { NetworkConfig, Policy } from '../../engine';
import { DOCTOR_BUGS, type DoctorBug, failingChecks, generateDoctorCase } from '../doctor';

// Für jeden Bug-Typ einen konkreten Fall über Seed-Suche einsammeln.
function caseFor(bug: DoctorBug) {
  for (let i = 0; i < 500; i++) {
    const c = generateDoctorCase(`seed-${bug}-${i}`);
    if (c.bug === bug) return c;
  }
  throw new Error(`kein Fall fuer ${bug} gefunden`);
}

const withPolicies = (net: NetworkConfig, policies: Policy[]): NetworkConfig => ({
  ...net,
  policies,
});

describe('Config Doctor', () => {
  it('jeder Fall startet KAPUTT (Suite ist rot)', () => {
    for (const bug of DOCTOR_BUGS) {
      const c = caseFor(bug);
      expect(failingChecks(c.suite, c.network)).toBeGreaterThan(0);
    }
  });

  it('nat-missing: SNAT aktivieren macht die Suite gruen', () => {
    const c = caseFor('nat-missing');
    const fixed = c.network.policies.map((p) =>
      p.name === 'lan-web-out' ? { ...p, nat: true } : p,
    );
    expect(failingChecks(c.suite, withPolicies(c.network, fixed))).toBe(0);
  });

  it('disabled: Regel aktivieren macht die Suite gruen', () => {
    const c = caseFor('disabled');
    const fixed = c.network.policies.map((p) =>
      p.name === 'lan-web-out' ? { ...p, enabled: true } : p,
    );
    expect(failingChecks(c.suite, withPolicies(c.network, fixed))).toBe(0);
  });

  it('order: die breite Deny entfernen macht die Suite gruen', () => {
    const c = caseFor('order');
    const fixed = c.network.policies.filter((p) => p.name !== 'block-outbound');
    expect(failingChecks(c.suite, withPolicies(c.network, fixed))).toBe(0);
  });

  it('Kontroll-Check beisst: alles auf service ALL oeffnen laesst RDP durch → bleibt rot', () => {
    const c = caseFor('disabled');
    // Regel aktivieren, aber Service viel zu weit auf ALL — RDP-Deny-Kontrolle faellt
    const overly = c.network.policies.map((p) =>
      p.name === 'lan-web-out' ? { ...p, enabled: true, service: ['ALL'] } : p,
    );
    expect(failingChecks(c.suite, withPolicies(c.network, overly))).toBeGreaterThan(0);
  });
});
