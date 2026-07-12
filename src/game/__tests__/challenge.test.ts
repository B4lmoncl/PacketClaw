import { describe, expect, it } from 'vitest';
import { evaluate } from '../../engine';
import { generateChallenge } from '../challenge';

describe('generateChallenge', () => {
  it('gleicher Seed + Größe ⇒ identisches Regelwerk', () => {
    expect(generateChallenge('abc', 'medium')).toEqual(generateChallenge('abc', 'medium'));
  });

  it('Größen liefern die erwartete Regelanzahl', () => {
    expect(generateChallenge('s', 'small').network.policies).toHaveLength(16);
    expect(generateChallenge('s', 'medium').network.policies).toHaveLength(26);
    expect(generateChallenge('s', 'large').network.policies).toHaveLength(38);
  });

  it('Policy-IDs sind eindeutig; erste Regel ist der Accept-Anker', () => {
    const level = generateChallenge('ids', 'large');
    const ids = level.network.policies.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(level.network.policies[0]?.action).toBe('accept');
  });

  it('enthält tote (disabled) Regeln — gewachsenes Regelwerk', () => {
    const level = generateChallenge('dead', 'large');
    expect(level.network.policies.some((p) => !p.enabled)).toBe(true);
  });

  it('enthält redundante Alt-Regeln (OLD_-Duplikate) über mehrere Seeds', () => {
    let sawOld = false;
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      if (
        generateChallenge(seed, 'large').network.policies.some((p) => p.name.startsWith('OLD_'))
      ) {
        sawOld = true;
        break;
      }
    }
    expect(sawOld).toBe(true);
  });

  it('acht auswertbare Fragen, jede berührt eine Policy', () => {
    const level = generateChallenge('q', 'medium');
    expect(level.packets).toHaveLength(8);
    for (const packet of level.packets) {
      const verdict = evaluate(packet, level.network);
      expect(['accept', 'deny']).toContain(verdict.action);
      expect(verdict.trace.some((s) => s.kind.startsWith('policy'))).toBe(true);
      if (packet.protocol !== 'icmp') expect(packet.dstPort).toBeDefined();
    }
  });

  it('mindestens eine ACCEPT-Frage ist dabei (Anker greift)', () => {
    const level = generateChallenge('acc', 'medium');
    const accepts = level.packets.filter((p) => evaluate(p, level.network).action === 'accept');
    expect(accepts.length).toBeGreaterThanOrEqual(1);
  });
});
