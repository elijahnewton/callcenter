import Dexie, { type Table } from 'dexie';
import type { CampaignRecord, SessionEntry } from '../types';

class CallCenterDatabase extends Dexie {
  records!: Table<CampaignRecord, number>;
  session!: Table<SessionEntry, string>;

  constructor() {
    super('ChurchCallCenter');
    this.version(1).stores({
      records: 'id,congregantId,status,name,phone',
      session: 'key',
    });
  }
}

export const db = new CallCenterDatabase();
