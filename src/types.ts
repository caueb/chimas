export interface SnafflerEntry {
  time: string;
  level: string;
  message: string;
  eventProperties: any;
}

export interface SnafflerJsonData {
  entries: SnafflerEntry[];
}

export interface FileResult {
  rating: 'Red' | 'Green' | 'Yellow' | 'Black';
  fullPath: string;
  fileName: string;
  creationTime: string;
  lastModified: string;
  size: string;
  matchContext: string;
  ruleName: string;
  matchedStrings: string[];
  triage: string;
  userContext?: string; // Optional field for user context from text logs
  rwStatus?: {
    readable: boolean;
    writable: boolean;
    executable: boolean;
    deleteable: boolean;
  };
}

export interface ShareResult {
  rating: 'Red' | 'Green' | 'Yellow' | 'Black';
  sharePath: string;
  shareName: string;
  systemId: string;
  shareComment: string;
  listable: boolean;
  rootWritable: boolean;
  rootReadable: boolean;
  rootModifyable: boolean;
  snaffle: boolean;
  scanShare: boolean;
  triage: string;
  userContext?: string; // Optional field for user context from text logs
}

export interface Stats {
  total: number;
  red: number;
  green: number;
  yellow: number;
  black: number;
}

export interface CustomFilter {
  id: string;
  text: string;
}

export type SortField = 'rating' | 'fullPath' | 'creationTime' | 'lastModified' | 'size';
export type SortDirection = 'asc' | 'desc'; 