import { describe, expect, it } from 'vitest';
import { makeConfig, makePolicy } from '../config';
import { canDelete, findReferences, referenceCount, unusedObjects } from '../references';
import type { NetworkConfig } from '../types';
import { baseConfig } from './fixtures';

/** Das Fixture-Netz mit ein paar Regeln, die die ueblichen Felder benutzen. */
function net(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return baseConfig({
    policies: [
      makePolicy({
        id: 1,
        name: 'LAN to Web',
        srcintf: ['port1'],
        dstintf: ['wan1'],
        srcaddr: ['LAN_NET'],
        dstaddr: ['all'],
        service: ['WEB'],
        nat: true,
      }),
      makePolicy({
        id: 2,
        name: 'Publish Web',
        srcintf: ['wan1'],
        dstintf: ['port2'],
        srcaddr: ['all'],
        dstaddr: ['VIP_WEB'],
        service: ['HTTPS'],
      }),
      makePolicy({
        id: 3,
        name: 'Inside to DMZ',
        srcintf: ['inside'],
        dstintf: ['port2'],
        srcaddr: ['INTERNAL'],
        dstaddr: ['SERVERS'],
        service: ['HTTPS'],
      }),
    ],
    ...overrides,
  });
}

describe('findReferences — direkte Verweise, wie in FortiOS', () => {
  it('findet ein Adressobjekt in der Policy, die es benutzt', () => {
    const refs = findReferences(net(), 'address', 'LAN_NET');
    // LAN_NET steht in Policy 1 (srcaddr) und in der Gruppe INTERNAL
    expect(refs).toEqual([
      { via: 'policy', name: 'LAN to Web', policyId: 1, field: 'srcaddr' },
      { via: 'addressGroup', name: 'INTERNAL', field: 'member' },
    ]);
  });

  /**
   * DIE zentrale Semantik: SRV_WEB01 steckt in SERVERS, SERVERS steht in
   * Policy 3. FortiOS zaehlt fuer SRV_WEB01 trotzdem nur EINEN Verweis — die
   * Gruppe. Wer aufraeumen will, muss die Kette zuruecklaufen.
   */
  it('zaehlt NUR direkte Verweise, nicht die Kette darueber', () => {
    const refs = findReferences(net(), 'address', 'SRV_WEB01');
    expect(refs).toEqual([{ via: 'addressGroup', name: 'SERVERS', field: 'member' }]);
    expect(referenceCount(net(), 'addressGroup', 'SERVERS')).toBe(1);
  });

  it('findet dieselbe Policy zweimal, wenn sie das Objekt in zwei Feldern nennt', () => {
    const config = net({
      policies: [
        makePolicy({ id: 1, name: 'Hairpin', srcaddr: ['DMZ_NET'], dstaddr: ['DMZ_NET'] }),
      ],
    });
    expect(findReferences(config, 'address', 'DMZ_NET')).toEqual([
      { via: 'policy', name: 'Hairpin', policyId: 1, field: 'srcaddr' },
      { via: 'policy', name: 'Hairpin', policyId: 1, field: 'dstaddr' },
      // DMZ_NET haengt im Fixture ausserdem in ALL_PRIVATE
      { via: 'addressGroup', name: 'ALL_PRIVATE', field: 'member' },
    ]);
  });

  it('findet Services in Policies und in Service-Gruppen', () => {
    expect(findReferences(net(), 'service', 'HTTPS')).toEqual([
      { via: 'policy', name: 'Publish Web', policyId: 2, field: 'service' },
      { via: 'policy', name: 'Inside to DMZ', policyId: 3, field: 'service' },
      { via: 'serviceGroup', name: 'WEB', field: 'member' },
    ]);
  });

  it('findet ein VIP im dstaddr', () => {
    expect(findReferences(net(), 'vip', 'VIP_WEB')).toEqual([
      { via: 'policy', name: 'Publish Web', policyId: 2, field: 'dstaddr' },
    ]);
  });

  it('findet eine Zone im Interface-Feld', () => {
    expect(findReferences(net(), 'zone', 'inside')).toEqual([
      { via: 'policy', name: 'Inside to DMZ', policyId: 3, field: 'srcintf' },
    ]);
  });

  /**
   * Zonen nennen ihre Mitglieder mal per ID, mal per Name — die Engine ist da
   * lenient (siehe expandIntfSet), also muss die Referenzsuche es auch sein.
   * Sonst zeigt die Ref.-Spalte 0 fuer ein Interface, das sehr wohl in einer
   * Zone haengt.
   */
  it('findet ein Interface in einer Zone, egal ob per ID oder Name eingetragen', () => {
    const byId = findReferences(net(), 'interface', 'port1');
    expect(byId).toContainEqual({ via: 'zone', name: 'inside', field: 'member' });

    const byName = net({ zones: [{ id: 'zn-1', name: 'inside', members: ['port1'] }] });
    expect(findReferences(byName, 'interface', 'port1')).toContainEqual({
      via: 'zone',
      name: 'inside',
      field: 'member',
    });
  });

  it('findet ein Interface in Policies, Zonen UND Routen', () => {
    const refs = findReferences(net(), 'interface', 'port1');
    expect(refs).toEqual([
      { via: 'policy', name: 'LAN to Web', policyId: 1, field: 'srcintf' },
      { via: 'zone', name: 'inside', field: 'member' },
      { via: 'route', name: '10.0.1.0/24', field: 'device' },
    ]);
  });

  it('findet Verweise in Local-In-Policies', () => {
    const config = net({
      localInPolicies: [
        {
          id: 1,
          name: 'Mgmt only',
          enabled: true,
          intf: 'port1',
          srcaddr: ['MGMT_RANGE'],
          // Nicht „all": die Local-In-Tabelle referenziert hier ein echtes
          // Objekt, sonst prueft der Test das dstaddr-Feld gar nicht
          dstaddr: ['LAN_NET'],
          service: ['HTTPS'],
          action: 'accept',
          schedule: 'always',
        },
      ],
    });
    expect(findReferences(config, 'address', 'MGMT_RANGE')).toEqual([
      { via: 'localInPolicy', name: 'Mgmt only', policyId: 1, field: 'srcaddr' },
    ]);
    expect(findReferences(config, 'address', 'LAN_NET')).toContainEqual({
      via: 'localInPolicy',
      name: 'Mgmt only',
      policyId: 1,
      field: 'dstaddr',
    });
    expect(findReferences(config, 'service', 'HTTPS')).toContainEqual({
      via: 'localInPolicy',
      name: 'Mgmt only',
      policyId: 1,
      field: 'service',
    });
    expect(findReferences(config, 'interface', 'port1')).toContainEqual({
      via: 'localInPolicy',
      name: 'Mgmt only',
      policyId: 1,
      field: 'intf',
    });
  });

  it('ein Netz ohne Local-In-Tabelle stuerzt nicht ab', () => {
    const config = makeConfig({ policies: [makePolicy({ id: 1, srcaddr: ['X'] })] });
    expect(findReferences(config, 'address', 'X')).toHaveLength(1);
  });

  it('ein unbekannter Name hat null Verweise', () => {
    expect(findReferences(net(), 'address', 'GIBTSNICHT')).toEqual([]);
  });

  /**
   * Ein Interface-Name, den es gar nicht gibt: die Zonen-Suche darf dann nicht
   * ueber die fehlende ID stolpern. Kommt vor, sobald ein Level ein Interface
   * umbenennt und eine Zone auf den alten Namen zeigt.
   */
  it('ein Interface-Name ohne Interface dahinter faellt sauber auf null', () => {
    const config = net({ zones: [{ id: 'zn-1', name: 'inside', members: ['if-1'] }] });
    expect(findReferences(config, 'interface', 'port9')).toEqual([]);
  });
});

describe('Tokens sind keine Objekte', () => {
  /**
   * `all`, `ALL` und `any` sind Platzhalter im Policy-Feld. Wuerden sie als
   * Verweis zaehlen, haette jedes Netz ein Phantom-Objekt mit der hoechsten
   * Ref.-Zahl im Bestand.
   */
  it('all/ALL/any zaehlen nicht als Verweis auf ein gleichnamiges Objekt', () => {
    const config = net();
    expect(referenceCount(config, 'address', 'all')).toBe(0);
    expect(referenceCount(config, 'service', 'ALL')).toBe(0);
    expect(referenceCount(config, 'interface', 'any')).toBe(0);
  });

  /**
   * Heisst aber wirklich ein Objekt so, ist es dasselbe Ding — auf einer
   * echten FortiGate IST `all` ein Adressobjekt (0.0.0.0/0).
   */
  it('existiert ein Objekt mit dem Token-Namen, zaehlt der Eintrag doch', () => {
    const config = net({
      addresses: [{ id: 'a-all', name: 'all', type: 'subnet', subnet: '0.0.0.0/0' }],
    });
    expect(referenceCount(config, 'address', 'all')).toBeGreaterThan(0);
  });

  /**
   * Die Token-Ausnahme gilt fuer JEDE Objektart, nicht nur fuer Adressen.
   * Der Test prueft beide Richtungen an einer Konfiguration: die Art, die ein
   * gleichnamiges Objekt hat, zaehlt — die anderen zaehlen nicht.
   */
  it('gilt fuer jede Objektart getrennt', () => {
    const config = makeConfig({
      interfaces: [{ id: 'if-1', name: 'port1' }],
      // Je Art EIN Objekt, das wie sein Token heisst
      addresses: [{ id: 'a', name: 'all', type: 'subnet', subnet: '0.0.0.0/0' }],
      addressGroups: [{ id: 'g', name: 'all', members: [] }],
      services: [{ id: 's', name: 'ALL', protocol: 'any' }],
      serviceGroups: [{ id: 'sg', name: 'ALL', members: [] }],
      vips: [{ id: 'v', name: 'all', extIp: '1.1.1.1', mappedIp: '2.2.2.2' }],
      zones: [{ id: 'z', name: 'any', members: [] }],
      policies: [makePolicy({ id: 1, name: 'Alles' })],
    });
    // Vorhanden ⇒ der Token-Eintrag der Policy ist ein Verweis
    for (const kind of [
      'address',
      'addressGroup',
      'service',
      'serviceGroup',
      'vip',
      'zone',
    ] as const) {
      const token =
        kind === 'service' || kind === 'serviceGroup' ? 'ALL' : kind === 'zone' ? 'any' : 'all';
      expect(referenceCount(config, kind, token), `${kind} sollte zaehlen`).toBeGreaterThan(0);
    }
    // Kein Interface heisst „any" ⇒ srcintf/dstintf "any" bleibt ein Platzhalter
    expect(referenceCount(config, 'interface', 'any')).toBe(0);
  });
});

describe('canDelete — die Regel, an der im Alltag jedes Aufraeumen haengt', () => {
  it('ein benutztes Objekt laesst sich nicht loeschen und nennt den Grund', () => {
    const result = canDelete(net(), 'address', 'LAN_NET');
    expect(result.ok).toBe(false);
    expect(result.blockedBy).toHaveLength(2);
  });

  it('ein unbenutztes Objekt laesst sich loeschen', () => {
    expect(canDelete(net(), 'address', 'P2P_NET').ok).toBe(true);
  });

  /**
   * Erst die Policy weg, dann die Gruppe, dann das Objekt: genau diese Kette
   * muss man auf einer FortiGate abarbeiten.
   */
  it('die Kette muss von aussen nach innen abgeraeumt werden', () => {
    const withoutPolicies = net({ policies: [] });
    // Die Gruppe ist jetzt frei …
    expect(canDelete(withoutPolicies, 'addressGroup', 'SERVERS').ok).toBe(true);
    // … das Mitglied aber noch nicht, solange die Gruppe steht
    expect(canDelete(withoutPolicies, 'address', 'SRV_WEB01').ok).toBe(false);

    const withoutGroups = net({ policies: [], addressGroups: [] });
    expect(canDelete(withoutGroups, 'address', 'SRV_WEB01').ok).toBe(true);
  });
});

describe('unusedObjects — der Aufraeum-Kandidat', () => {
  it('meldet genau die Objekte ohne Verweis', () => {
    const unused = unusedObjects(net());
    const names = unused.map((u) => u.name);
    expect(names).toContain('P2P_NET'); // nirgends benutzt
    expect(names).not.toContain('LAN_NET'); // Policy 1 + Gruppe INTERNAL
    expect(names).not.toContain('SRV_WEB01'); // in der Gruppe SERVERS
    expect(names).not.toContain('VIP_WEB'); // Policy 2
  });

  /**
   * Interfaces sind Hardware, kein Muell. „Loesch mal port3" waere ein
   * schlechter Rat, deshalb stehen sie bewusst nicht auf der Liste.
   */
  it('nennt niemals ein Interface', () => {
    const bare = makeConfig({
      interfaces: [{ id: 'if-1', name: 'port1' }],
      addresses: [{ id: 'a-1', name: 'FREI', type: 'host', host: '10.0.0.1' }],
    });
    const unused = unusedObjects(bare);
    expect(unused.every((u) => u.kind !== 'interface')).toBe(true);
    expect(unused).toEqual([{ kind: 'address', name: 'FREI' }]);
  });

  it('ein leeres Netz hat nichts aufzuraeumen', () => {
    expect(unusedObjects(makeConfig({}))).toEqual([]);
  });

  /** Jede Objektart muss auftauchen koennen, sonst prueft der Test nur Adressen. */
  it('deckt alle aufraeumbaren Objektarten ab', () => {
    const config = makeConfig({
      addresses: [{ id: 'a', name: 'A', type: 'host', host: '10.0.0.1' }],
      addressGroups: [{ id: 'g', name: 'G', members: [] }],
      services: [{ id: 's', name: 'S', protocol: 'tcp', dstPorts: [{ from: 1, to: 1 }] }],
      serviceGroups: [{ id: 'sg', name: 'SG', members: [] }],
      vips: [{ id: 'v', name: 'V', extIp: '1.1.1.1', mappedIp: '2.2.2.2' }],
      zones: [{ id: 'z', name: 'Z', members: [] }],
    });
    expect(
      unusedObjects(config)
        .map((u) => u.kind)
        .sort(),
    ).toEqual(['address', 'addressGroup', 'service', 'serviceGroup', 'vip', 'zone']);
  });
});
