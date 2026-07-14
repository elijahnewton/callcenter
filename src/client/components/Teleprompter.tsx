import { PhoneCall } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CampaignRecord } from '../types';

interface TeleprompterProps {
  script: string;
  currentRecord: CampaignRecord;
  callerName: string;
  branchName: string;
}

function tokenizeScript(script: string, values: Record<string, string>): ReactNode[] {
  const tokenRegex = /(\[Name\]|\[CallerName\]|\[BranchName\])/g;
  return script.split(tokenRegex).map((part, index) => {
    const replacement = values[part];
    if (replacement !== undefined) {
      return (
        <strong className="name-highlight" key={`${part}-${index}`}>
          {replacement}
        </strong>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

export function Teleprompter({ script, currentRecord, callerName, branchName }: TeleprompterProps) {
  const scriptNodes = tokenizeScript(script, {
    '[Name]': currentRecord.name || 'Friend',
    '[CallerName]': callerName,
    '[BranchName]': branchName,
  });

  return (
    <div className="teleprompter">
      <div className="teleprompter-content">{scriptNodes}</div>
      <div className="contact-info">
        <p><strong>{currentRecord.name || 'Unknown Contact'}</strong></p>
        <p className="text-muted">{currentRecord.phone || 'No phone number'}</p>
      </div>
      {currentRecord.phone ? (
        <a href={`tel:${currentRecord.phone}`} className="call-button" aria-label={`Call ${currentRecord.name}`}>
          <PhoneCall size={18} />
          <span>Call Now</span>
        </a>
      ) : (
        <button type="button" className="call-button" disabled>
          <PhoneCall size={18} />
          <span>No Phone Number</span>
        </button>
      )}
    </div>
  );
}
