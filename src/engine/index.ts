/**
 * PacketClaw Engine — öffentliche API.
 * Pure TypeScript, deterministisch, keine UI-Abhängigkeiten.
 */
export * from './types';
export {
  ipToInt,
  intToIp,
  isValidIPv4,
  parseCidr,
  cidrContains,
  rangeContains,
  longestPrefixMatch,
  type CidrRange,
} from './ip';
export { matchesWorkHours, scheduleMatches } from './schedule';
export {
  createResolver,
  addressObjectContainsIp,
  serviceObjectMatches,
  type Resolver,
} from './resolve';
export { evaluate, matchVip, firstFailedField, matchesExpectation } from './evaluate';
export {
  findShadowedPolicies,
  findRedundantPolicies,
  findOverbroadPolicies,
  type ShadowedPolicy,
  type OverbroadPolicy,
} from './analysis';
export { makeConfig, makePolicy } from './config';
export { createRng, mulberry32, type Rng } from './rng';
