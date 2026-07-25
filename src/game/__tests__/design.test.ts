import { describe, expect, it } from 'vitest';
import { makePolicy } from '../../engine';
import type { NetworkConfig, Policy } from '../../engine';
import { CAPABILITIES, generateDesignSpec, reviewDesign, SEGMENTATION } from '../design';
import type { DesignSpec } from '../design';

/** Enge Referenz-Regel je Capability — so wuerde ein Profi es bauen. */
const REFERENCE: Record<string, Partial<Policy>> = {
  lanWeb: {
    srcintf: ['port1'],
    dstintf: ['wan1'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['all'],
    service: ['HTTPS'],
    nat: true,
  },
  lanDns: {
    srcintf: ['port1'],
    dstintf: ['wan1'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['all'],
    service: ['DNS'],
    nat: true,
  },
  lanDmzHttps: {
    srcintf: ['port1'],
    dstintf: ['port2'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['SRV_WEB01'],
    service: ['HTTPS'],
  },
  guestWeb: {
    srcintf: ['vlan20'],
    dstintf: ['wan1'],
    srcaddr: ['GUEST_NET'],
    dstaddr: ['all'],
    service: ['HTTPS'],
    nat: true,
  },
  adminDmzSsh: {
    srcintf: ['port1'],
    dstintf: ['port2'],
    srcaddr: ['ADMIN_PC'],
    dstaddr: ['SRV_WEB01'],
    service: ['SSH'],
  },
  lanDmzPing: {
    srcintf: ['port1'],
    dstintf: ['port2'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['SRV_WEB01'],
    service: ['PING'],
  },
  lanRdpOut: {
    srcintf: ['port1'],
    dstintf: ['wan1'],
    srcaddr: ['LAN_NET'],
    dstaddr: ['all'],
    service: ['RDP'],
    nat: true,
  },
};

/** Baut die Musterloesung fuer einen Auftrag (nur die allow-Anforderungen). */
function solve(spec: DesignSpec): NetworkConfig {
  const policies = spec.requirements
    .filter((r) => r.kind === 'allow')
    .map((r, i) =>
      makePolicy({
        id: i + 1,
        name: r.capabilityId,
        action: 'accept',
        ...REFERENCE[r.capabilityId],
      }),
    );
  return { ...spec.baseNetwork, policies };
}

const withPolicies = (spec: DesignSpec, policies: Policy[]): NetworkConfig => ({
  ...spec.baseNetwork,
  policies,
});

describe('Change Request (Policy Design)', () => {
  it('ist deterministisch pro Seed und variiert zwischen Seeds', () => {
    const a = generateDesignSpec('mo');
    const b = generateDesignSpec('mo');
    expect(a.requirements.map((r) => r.capabilityId)).toEqual(
      b.requirements.map((r) => r.capabilityId),
    );
    const ids = new Set(
      ['s1', 's2', 's3', 's4', 's5', 's6'].map((s) =>
        generateDesignSpec(s)
          .requirements.map((r) => r.capabilityId)
          .join(','),
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it('Auftrag: 3 allow-Anforderungen + Segmentierung als deny, Rest wird Guard', () => {
    const spec = generateDesignSpec('shape');
    expect(spec.requirements).toHaveLength(4);
    expect(spec.requirements.filter((r) => r.kind === 'allow')).toHaveLength(3);
    const last = spec.requirements.at(-1);
    expect(last?.kind).toBe('deny');
    expect(last?.capabilityId).toBe(SEGMENTATION.id);
    // gefordert + Guards = ganzer Katalog, ohne Ueberschneidung
    expect(spec.guards).toHaveLength(CAPABILITIES.length - 3);
    const requested = spec.requirements
      .filter((r) => r.kind === 'allow')
      .map((r) => r.capabilityId);
    expect(spec.guards.some((g) => requested.includes(g.id))).toBe(false);
  });

  it('leeres Regelwerk: allow-Anforderungen rot, Segmentierung schon gruen (Implicit Deny)', () => {
    const spec = generateDesignSpec('empty');
    const review = reviewDesign(spec.baseNetwork, spec);
    expect(review.passed).toBe(false);
    const deny = review.perRequirement.at(-1);
    expect(deny?.ok).toBe(true);
    expect(review.perRequirement.slice(0, 3).every((r) => !r.ok)).toBe(true);
    expect(review.breaches).toEqual([]);
  });

  it('Musterloesung erfuellt den Auftrag und ist saubere Handwerksarbeit', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const spec = generateDesignSpec(seed);
      const review = reviewDesign(solve(spec), spec);
      expect(review.passed, `Seed ${seed}: Auftrag nicht erfuellt`).toBe(true);
      expect(review.breaches, `Seed ${seed}: zu weit geoeffnet`).toEqual([]);
      expect(review.clean, `Seed ${seed}: unsaubere Regeln`).toBe(true);
    }
  });

  it('fehlendes SNAT wird als natMissing gemeldet, nicht als "geht nicht"', () => {
    // Seed mit lanWeb als Anforderung suchen
    let spec = generateDesignSpec('nat-0');
    for (let i = 0; i < 50 && !spec.requirements.some((r) => r.needsNat); i++) {
      spec = generateDesignSpec(`nat-${i}`);
    }
    const target = spec.requirements.find((r) => r.needsNat);
    expect(target).toBeDefined();
    const policies = solve(spec).policies.map((p) =>
      p.name === target?.capabilityId ? { ...p, nat: false } : p,
    );
    const review = reviewDesign(withPolicies(spec, policies), spec);
    const result = review.perRequirement.find((r) => r.capabilityId === target?.capabilityId);
    expect(result?.natMissing).toBe(true);
    expect(result?.ok).toBe(false);
    expect(review.passed).toBe(false);
  });

  it('Zonen-Falle: "inside → all/ALL" erfuellt die allow-Regeln, bricht aber die Segmentierung', () => {
    const spec = generateDesignSpec('lazy');
    // inside umfasst port1 UND vlan20 — eine Sammelregel oeffnet auch Gast→LAN
    const lazy = makePolicy({
      id: 1,
      name: 'allow-everything',
      srcintf: ['inside'],
      dstintf: ['any'],
      srcaddr: ['all'],
      dstaddr: ['all'],
      service: ['ALL'],
      action: 'accept',
      nat: true,
    });
    const review = reviewDesign(withPolicies(spec, [lazy]), spec);
    const deny = review.perRequirement.at(-1);
    expect(deny?.ok).toBe(false); // Gast erreicht das LAN
    expect(review.breaches.length).toBeGreaterThan(0);
    expect(review.passed).toBe(false);
  });

  it('zu breite Quelle wird als overbroad erkannt, obwohl der Auftrag erfuellt ist', () => {
    const spec = generateDesignSpec('broad');
    const policies = solve(spec).policies.map((p) => ({ ...p, srcaddr: ['all'] }));
    const review = reviewDesign(withPolicies(spec, policies), spec);
    expect(review.overbroad).toBeGreaterThan(0);
    expect(review.clean).toBe(false);
  });

  it('tote Regel wird als shadowed erkannt', () => {
    const spec = generateDesignSpec('dead');
    const solved = solve(spec);
    const duplicate = { ...(solved.policies[0] as Policy), id: 99, name: 'OLD_duplicate' };
    const review = reviewDesign(withPolicies(spec, [...solved.policies, duplicate]), spec);
    expect(review.shadowed).toBeGreaterThan(0);
    expect(review.clean).toBe(false);
  });
});
