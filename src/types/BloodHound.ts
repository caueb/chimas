// ── Raw BloodHound JSON file structures ──

export interface BHFileEnvelope<T> {
  data: T[];
  meta: {
    methods: number;
    type: string;
    count: number;
    version: number;
    collectorversion: string;
  };
}

export interface BHContainedBy {
  ObjectIdentifier: string;
  ObjectType: string; // "OU" | "Container" | "Domain"
}

export interface BHLink {
  GUID: string;       // BloodHound ObjectIdentifier of the GPO
  IsEnforced: boolean;
}

export interface BHGpo {
  ObjectIdentifier: string;
  Properties: {
    name: string;                 // "NAME@DOMAIN"
    distinguishedname: string;    // "CN={AD-GUID},CN=POLICIES,..."
    gpcpath?: string;             // "\\DOMAIN\SYSVOL\...\{AD-GUID}"
    domain?: string;
    gpostatus?: string;
    [key: string]: unknown;
  };
  IsDeleted: boolean;
  ContainedBy: BHContainedBy | null;
}

export interface BHOu {
  ObjectIdentifier: string;
  Properties: {
    name: string;
    distinguishedname: string;
    blocksinheritance: boolean;
    domain?: string;
    [key: string]: unknown;
  };
  Links: BHLink[];
  ChildObjects: Array<{ ObjectIdentifier: string; ObjectType: string }>;
  ContainedBy: BHContainedBy | null;
}

export interface BHDomain {
  ObjectIdentifier: string;
  Properties: {
    name: string;
    distinguishedname: string;
    domain?: string;
    [key: string]: unknown;
  };
  Links: BHLink[];
  ChildObjects: Array<{ ObjectIdentifier: string; ObjectType: string }>;
}

export interface BHContainer {
  ObjectIdentifier: string;
  Properties: {
    name: string;
    [key: string]: unknown;
  };
  ChildObjects: Array<{ ObjectIdentifier: string; ObjectType: string }>;
  ContainedBy: BHContainedBy | null;
}

export interface BHPrincipal {
  ObjectIdentifier: string;
  Properties: {
    name: string;
    domain?: string;
    enabled?: boolean;
    [key: string]: unknown;
  };
  ContainedBy: BHContainedBy | null;
}

// ── Resolved / computed structures ──

export type BHFileType = 'gpos' | 'ous' | 'computers' | 'users' | 'groups' | 'domains' | 'containers';

export interface BloodHoundData {
  gpos: Map<string, BHGpo>;            // keyed by ObjectIdentifier
  ous: Map<string, BHOu>;              // keyed by ObjectIdentifier
  domains: Map<string, BHDomain>;      // keyed by ObjectIdentifier
  containers: Map<string, BHContainer>;// keyed by ObjectIdentifier
  computers: Map<string, BHPrincipal>; // keyed by ObjectIdentifier
  users: Map<string, BHPrincipal>;     // keyed by ObjectIdentifier
  groups: Map<string, BHPrincipal>;    // keyed by ObjectIdentifier

  // AD GUID (uppercase, no braces) -> BH GPO ObjectIdentifier
  adGuidToBhId: Map<string, string>;

  // Track which file types have been loaded
  loadedTypes: Set<BHFileType>;
  fileNames: string[];
}

/** Per-GPO resolved asset summary */
export interface GPOAssetSummary {
  computers: Array<{ name: string; ou: string }>;
  users: Array<{ name: string; ou: string }>;
  groups: Array<{ name: string; ou: string }>;
  linkedOUs: Array<{
    name: string;
    dn: string;
    isEnforced: boolean;
    isDirect: boolean; // true = directly linked, false = inherited
  }>;
  totalComputers: number;
  totalUsers: number;
  totalGroups: number;
  isDomainWide: boolean;
}
