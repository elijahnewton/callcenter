export type CallStatus = '' | 'yes' | 'no' | 'notpicking' | 'phoneoff' | 'changedaddr' | 'other';

export interface CampaignRecord {
  id: number;
  congregantId: number;
  name: string;
  phone: string;
  status: CallStatus;
  notes: string;
  customResponse: string;
}

export interface SessionEntry<T = unknown> {
  key: string;
  value: T;
}
