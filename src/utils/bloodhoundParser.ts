import type {
  BHFileType,
  BHGpo,
  BHOu,
  BHDomain,
  BHContainer,
  BHPrincipal,
  BloodHoundData,
  GPOAssetSummary,
} from '../types/BloodHound';

// ── Factory ──

export function createEmptyBloodHoundData(): BloodHoundData {
  return {
    gpos: new Map(),
    ous: new Map(),
    domains: new Map(),
    containers: new Map(),
    computers: new Map(),
    users: new Map(),
    groups: new Map(),
    adGuidToBhId: new Map(),
    loadedTypes: new Set(),
    fileNames: [],
  };
}

// ── Detection ──

const VALID_TYPES: Set<string> = new Set([
  'gpos', 'ous', 'computers', 'users', 'groups', 'domains', 'containers',
]);

export function detectBloodHoundFileType(json: unknown): BHFileType | null {
  if (
    typeof json !== 'object' || json === null ||
    !('meta' in json) || !('data' in json)
  ) return null;

  const meta = (json as Record<string, unknown>).meta;
  if (typeof meta !== 'object' || meta === null) return null;

  const type = (meta as Record<string, unknown>).type;
  if (typeof type === 'string' && VALID_TYPES.has(type)) {
    return type as BHFileType;
  }
  return null;
}

// ── GUID extraction ──

const DN_GUID_RE = /CN=\{([A-F0-9-]+)\}/i;
const PATH_GUID_RE = /\\{([A-F0-9-]+)\}/i;

export function extractAdGuidFromDN(dn: string): string | null {
  const m = DN_GUID_RE.exec(dn);
  return m ? m[1].toUpperCase() : null;
}

function extractAdGuidFromGpo(gpo: BHGpo): string | null {
  const fromDN = extractAdGuidFromDN(gpo.Properties.distinguishedname || '');
  if (fromDN) return fromDN;
  const fromPath = PATH_GUID_RE.exec(gpo.Properties.gpcpath || '');
  return fromPath ? fromPath[1].toUpperCase() : null;
}

/** Normalize a Group3r gpoId (may have braces) to uppercase, no braces */
export function normalizeAdGuid(gpoId: string): string {
  return gpoId.replace(/[{}]/g, '').toUpperCase();
}

// ── Parsing ──

/**
 * Parse a single BloodHound JSON file and merge into existing data.
 * Returns a new BloodHoundData object (immutable pattern).
 */
export function parseBloodHoundFile(
  json: unknown,
  existing: BloodHoundData,
  fileName: string,
): BloodHoundData {
  const fileType = detectBloodHoundFileType(json);
  if (!fileType) {
    throw new Error('Not a recognized BloodHound JSON file');
  }

  const envelope = json as { data: unknown[] };

  // Clone maps for immutability
  const result: BloodHoundData = {
    gpos: new Map(existing.gpos),
    ous: new Map(existing.ous),
    domains: new Map(existing.domains),
    containers: new Map(existing.containers),
    computers: new Map(existing.computers),
    users: new Map(existing.users),
    groups: new Map(existing.groups),
    adGuidToBhId: new Map(existing.adGuidToBhId),
    loadedTypes: new Set(existing.loadedTypes),
    fileNames: [...existing.fileNames, fileName],
  };
  result.loadedTypes.add(fileType);

  switch (fileType) {
    case 'gpos':
      for (const item of envelope.data as BHGpo[]) {
        result.gpos.set(item.ObjectIdentifier, item);
        const adGuid = extractAdGuidFromGpo(item);
        if (adGuid) {
          result.adGuidToBhId.set(adGuid, item.ObjectIdentifier);
        }
      }
      break;
    case 'ous':
      for (const item of envelope.data as BHOu[]) {
        result.ous.set(item.ObjectIdentifier, item);
      }
      break;
    case 'domains':
      for (const item of envelope.data as BHDomain[]) {
        result.domains.set(item.ObjectIdentifier, item);
      }
      break;
    case 'containers':
      for (const item of envelope.data as BHContainer[]) {
        result.containers.set(item.ObjectIdentifier, item);
      }
      break;
    case 'computers':
      for (const item of envelope.data as BHPrincipal[]) {
        result.computers.set(item.ObjectIdentifier, item);
      }
      break;
    case 'users':
      for (const item of envelope.data as BHPrincipal[]) {
        result.users.set(item.ObjectIdentifier, item);
      }
      break;
    case 'groups':
      for (const item of envelope.data as BHPrincipal[]) {
        result.groups.set(item.ObjectIdentifier, item);
      }
      break;
  }

  return result;
}

// ── Graph Resolution ──

/**
 * Find all OU ObjectIdentifiers that are children of the given parent,
 * recursively. Used to resolve OU hierarchy.
 */
function collectChildOUs(data: BloodHoundData, parentId: string): string[] {
  const children: string[] = [];
  for (const [ouId, ou] of data.ous) {
    if (ou.ContainedBy?.ObjectIdentifier === parentId) {
      children.push(ouId);
    }
  }
  return children;
}

/**
 * Recursively collect all effective OUs for a GPO link, respecting
 * blocksinheritance and IsEnforced.
 */
function resolveEffectiveOUs(
  data: BloodHoundData,
  ouId: string,
  isEnforced: boolean,
  visited: Set<string>,
): string[] {
  if (visited.has(ouId)) return [];
  visited.add(ouId);

  const result: string[] = [ouId];
  const childOUs = collectChildOUs(data, ouId);

  for (const childId of childOUs) {
    const childOU = data.ous.get(childId);
    if (!childOU) continue;
    // If child blocks inheritance and the link is NOT enforced, stop
    if (childOU.Properties.blocksinheritance && !isEnforced) continue;
    result.push(...resolveEffectiveOUs(data, childId, isEnforced, visited));
  }

  return result;
}

/**
 * Find all containers that are children of a given parent (OU, domain, or container).
 * This handles the case where users/groups are in containers within OUs.
 */
function collectContainerIds(data: BloodHoundData, parentId: string): string[] {
  const result: string[] = [];
  const queue = [parentId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const [cId, container] of data.containers) {
      if (container.ContainedBy?.ObjectIdentifier === current) {
        result.push(cId);
        queue.push(cId);
      }
    }
  }

  return result;
}

/**
 * Collect principals (users/computers/groups) contained by any of the given
 * container IDs (OUs, containers, or domain).
 */
function collectPrincipals(
  principalMap: Map<string, BHPrincipal>,
  containerIds: Set<string>,
): Array<{ name: string; ou: string }> {
  const result: Array<{ name: string; ou: string }> = [];
  for (const [, principal] of principalMap) {
    if (principal.ContainedBy && containerIds.has(principal.ContainedBy.ObjectIdentifier)) {
      result.push({
        name: principal.Properties.name,
        ou: principal.ContainedBy.ObjectIdentifier,
      });
    }
  }
  return result;
}

const EMPTY_SUMMARY: GPOAssetSummary = {
  computers: [],
  users: [],
  groups: [],
  linkedOUs: [],
  totalComputers: 0,
  totalUsers: 0,
  totalGroups: 0,
  isDomainWide: false,
};

/**
 * Parse a Group3r link string to extract the OU distinguished name and enforcement.
 * Example: "OU=Domain Controllers,DC=zzz,DC=prd (Enabled, Unenforced)"
 */
function parseGroup3rLink(link: string): { dn: string; isEnforced: boolean } | null {
  const statusMatch = link.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!statusMatch) return { dn: link.trim().toUpperCase(), isEnforced: false };
  const dn = statusMatch[1].trim().toUpperCase();
  const isEnforced = /enforced/i.test(statusMatch[2]) && !/unenforced/i.test(statusMatch[2]);
  return { dn, isEnforced };
}

/**
 * Find a BH OU by matching its distinguished name against a Group3r link DN.
 */
function findOUByDN(data: BloodHoundData, targetDN: string): string | null {
  for (const [ouId, ou] of data.ous) {
    if (ou.Properties.distinguishedname.toUpperCase() === targetDN) {
      return ouId;
    }
  }
  return null;
}

/**
 * Resolve all assets affected by a GPO, given its AD GUID from Group3r.
 * Optionally accepts Group3r link strings as fallback when BH doesn't have the GPO link.
 */
export function resolveGPOAssets(
  data: BloodHoundData,
  gpoIdRaw: string,
  group3rLinks?: string[],
): GPOAssetSummary {
  const adGuid = normalizeAdGuid(gpoIdRaw);
  const bhGpoId = data.adGuidToBhId.get(adGuid);
  if (!bhGpoId) return EMPTY_SUMMARY;

  // Step 1: Find all OUs and domains that link this GPO (from BloodHound)
  const directLinks: Array<{ id: string; type: 'ou' | 'domain'; isEnforced: boolean }> = [];

  for (const [ouId, ou] of data.ous) {
    for (const link of ou.Links) {
      if (link.GUID === bhGpoId) {
        directLinks.push({ id: ouId, type: 'ou', isEnforced: link.IsEnforced });
      }
    }
  }

  let isDomainWide = false;
  for (const [domainId, domain] of data.domains) {
    for (const link of domain.Links) {
      if (link.GUID === bhGpoId) {
        directLinks.push({ id: domainId, type: 'domain', isEnforced: link.IsEnforced });
        isDomainWide = true;
      }
    }
  }

  // Fallback: if BH has no links for this GPO, use Group3r link data to find OUs
  if (directLinks.length === 0 && group3rLinks && group3rLinks.length > 0) {
    for (const linkStr of group3rLinks) {
      const parsed = parseGroup3rLink(linkStr);
      if (!parsed) continue;
      const ouId = findOUByDN(data, parsed.dn);
      if (ouId) {
        directLinks.push({ id: ouId, type: 'ou', isEnforced: parsed.isEnforced });
      }
    }
  }

  // Step 2: Resolve effective OUs (expanding children, respecting inheritance)
  const effectiveOUIds = new Set<string>();
  const linkedOUs: GPOAssetSummary['linkedOUs'] = [];
  const visited = new Set<string>();

  for (const link of directLinks) {
    if (link.type === 'domain') {
      // Domain-level: all OUs under this domain are effective
      for (const [ouId, ou] of data.ous) {
        effectiveOUIds.add(ouId);
        linkedOUs.push({
          name: ou.Properties.name,
          dn: ou.Properties.distinguishedname,
          isEnforced: link.isEnforced,
          isDirect: false,
        });
      }
      // Also add the domain itself as a container
      effectiveOUIds.add(link.id);
    } else {
      // OU-level link
      const resolved = resolveEffectiveOUs(data, link.id, link.isEnforced, visited);
      for (const ouId of resolved) {
        effectiveOUIds.add(ouId);
        const ou = data.ous.get(ouId);
        if (ou) {
          linkedOUs.push({
            name: ou.Properties.name,
            dn: ou.Properties.distinguishedname,
            isEnforced: link.isEnforced,
            isDirect: ouId === link.id,
          });
        }
      }
    }
  }

  // Step 3: Also collect containers within effective OUs (users can be in containers)
  const allContainerIds = new Set(effectiveOUIds);
  for (const ouId of effectiveOUIds) {
    const nestedContainers = collectContainerIds(data, ouId);
    for (const cId of nestedContainers) {
      allContainerIds.add(cId);
    }
  }

  // Step 4: Collect affected principals
  const computers = collectPrincipals(data.computers, allContainerIds);
  const users = collectPrincipals(data.users, allContainerIds);
  const groups = collectPrincipals(data.groups, allContainerIds);

  // Resolve OU names for display
  const resolvedComputers = computers.map(c => ({
    name: c.name,
    ou: resolveContainerName(data, c.ou),
  }));
  const resolvedUsers = users.map(u => ({
    name: u.name,
    ou: resolveContainerName(data, u.ou),
  }));
  const resolvedGroups = groups.map(g => ({
    name: g.name,
    ou: resolveContainerName(data, g.ou),
  }));

  return {
    computers: resolvedComputers,
    users: resolvedUsers,
    groups: resolvedGroups,
    linkedOUs,
    totalComputers: computers.length,
    totalUsers: users.length,
    totalGroups: groups.length,
    isDomainWide,
  };
}

/** Resolve a container/OU/domain ObjectIdentifier to a display name */
function resolveContainerName(data: BloodHoundData, objectId: string): string {
  const ou = data.ous.get(objectId);
  if (ou) return ou.Properties.name;
  const domain = data.domains.get(objectId);
  if (domain) return domain.Properties.name;
  const container = data.containers.get(objectId);
  if (container) return container.Properties.name;
  return objectId;
}

/** Get a summary of all BloodHound data counts */
export function getBloodHoundSummary(data: BloodHoundData) {
  return {
    gpos: data.gpos.size,
    ous: data.ous.size,
    domains: data.domains.size,
    computers: data.computers.size,
    users: data.users.size,
    groups: data.groups.size,
    containers: data.containers.size,
    loadedTypes: Array.from(data.loadedTypes),
    fileCount: data.fileNames.length,
  };
}

// ── GPO Precedence Resolution ──

/**
 * For a set of GPO names that configure the same setting, determine which GPO
 * wins on each computer based on OU link order.
 *
 * In AD, when multiple GPOs are linked to the same OU:
 * - Lower link index = higher priority (applied last, wins)
 * - Enforced GPOs override non-enforced regardless of index
 *
 * Returns a map: computer name -> winning GPO name
 */
export function resolveGPOConflicts(
  data: BloodHoundData,
  gpoNames: string[],
  gpoNameToId: Map<string, string>,
  report: { gpos: Array<{ header: { gpo?: string; gpoId?: string } }> },
): Map<string, string> {
  // Build a set of all BH IDs and AD GUIDs for the GPOs in question
  const gpoIdentifiers = new Map<string, string>(); // any identifier -> gpo name
  for (const name of gpoNames) {
    const gpoId = gpoNameToId.get(name);
    if (!gpoId) continue;

    // BH ObjectIdentifier
    const adGuid = normalizeAdGuid(gpoId);
    const bhId = data.adGuidToBhId.get(adGuid);
    if (bhId) {
      gpoIdentifiers.set(bhId.toUpperCase(), name);
    }
    // Also add the AD GUID itself (BH sometimes uses AD GUIDs in link arrays)
    gpoIdentifiers.set(adGuid.toUpperCase(), name);
    // And with braces (some BH versions)
    gpoIdentifiers.set(gpoId.toUpperCase().replace(/[{}]/g, ''), name);
  }

  // For each OU, build precedence based on link order.
  // In AD's gpLink attribute, GPOs are listed in REVERSE priority order:
  // the LAST entry = Link Order 1 = highest priority = applied last = WINS.
  // BloodHound stores them in that same order, so HIGHER index = HIGHER priority.
  // We invert to: lower priority number = wins in sort.
  const ouPrecedence = new Map<string, Map<string, { gpoName: string; priority: number }>>();

  for (const [ouId, ou] of data.ous) {
    const precMap = new Map<string, { gpoName: string; priority: number }>();
    const maxIdx = ou.Links.length;
    for (let i = 0; i < ou.Links.length; i++) {
      const linkGuid = ou.Links[i].GUID.toUpperCase();
      const isEnforced = ou.Links[i].IsEnforced;
      const gpoName = gpoIdentifiers.get(linkGuid);
      if (gpoName) {
        // Higher index = higher priority, so invert: priority = maxIdx - i
        // Lower priority number = wins. Enforced always wins (negative).
        const priority = isEnforced ? (-1000 + (maxIdx - i)) : (maxIdx - i);
        precMap.set(gpoName, { gpoName, priority });
      }
    }
    if (precMap.size > 0) {
      ouPrecedence.set(ouId, precMap);
    }
  }

  // Also check domain-level links (same reverse-order convention)
  for (const [domainId, domain] of data.domains) {
    const precMap = new Map<string, { gpoName: string; priority: number }>();
    const maxIdx = domain.Links.length;
    for (let i = 0; i < domain.Links.length; i++) {
      const linkGuid = domain.Links[i].GUID.toUpperCase();
      const isEnforced = domain.Links[i].IsEnforced;
      const gpoName = gpoIdentifiers.get(linkGuid);
      if (gpoName) {
        // Domain-level GPOs have lower precedence than OU-level (applied first)
        // Unless enforced, then they override everything
        const priority = isEnforced ? (-2000 + (maxIdx - i)) : (1000 + (maxIdx - i));
        precMap.set(gpoName, { gpoName, priority });
      }
    }
    if (precMap.size > 0) {
      ouPrecedence.set(domainId, precMap);
    }
  }

  // For each computer, find which of the conflicting GPOs wins
  const result = new Map<string, string>();

  for (const [, computer] of data.computers) {
    const containerId = computer.ContainedBy?.ObjectIdentifier;
    if (!containerId) continue;

    // Walk up the OU chain to collect all applicable GPOs with their precedence
    const applicableGPOs: Array<{ gpoName: string; priority: number; level: number }> = [];
    let currentId: string | null = containerId;
    let level = 0;

    while (currentId) {
      const precMap = ouPrecedence.get(currentId);
      if (precMap) {
        for (const [, entry] of precMap) {
          applicableGPOs.push({ ...entry, level });
        }
      }
      // Move up to parent OU/domain
      const ou = data.ous.get(currentId);
      if (ou?.ContainedBy) {
        currentId = ou.ContainedBy.ObjectIdentifier;
        level++;
      } else {
        // Check if parent is a domain
        if (data.domains.has(currentId)) {
          break; // Already at domain level
        }
        // Try domain as parent
        const domainId = Array.from(data.domains.keys())[0];
        if (domainId && currentId !== domainId) {
          currentId = domainId;
          level++;
        } else {
          break;
        }
      }
    }

    if (applicableGPOs.length === 0) continue;

    // Sort: enforced first (negative priority), then by level (closer OU wins),
    // then by link index (lower = higher priority)
    applicableGPOs.sort((a, b) => {
      // Enforced always wins (negative priority)
      if (a.priority < 0 && b.priority >= 0) return -1;
      if (b.priority < 0 && a.priority >= 0) return 1;
      // Both enforced or both non-enforced: closer OU (lower level) wins
      if (a.level !== b.level) return a.level - b.level;
      // Same level: lower index wins
      return a.priority - b.priority;
    });

    result.set(computer.Properties.name, applicableGPOs[0].gpoName);
  }

  return result;
}
