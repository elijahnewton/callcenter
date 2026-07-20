import { PhoneCall, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { CampaignRecord } from '../types';

interface TeleprompterProps {
  script: string;
  currentRecord: CampaignRecord;
  callerName: string;
  branchName: string;
  onUpdateContact: (name: string, phone: string) => void;
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

export function Teleprompter({ script, currentRecord, callerName, branchName, onUpdateContact }: TeleprompterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(currentRecord.name);
  const [editPhone, setEditPhone] = useState(currentRecord.phone);

  // Sync state if the user navigates to a different record while editing
  useEffect(() => {
    setEditName(currentRecord.name);
    setEditPhone(currentRecord.phone);
    setIsEditing(false);
  }, [currentRecord.id]);

  const scriptNodes = tokenizeScript(script, {
    '[Name]': currentRecord.name || 'Friend',
    '[CallerName]': callerName,
    '[BranchName]': branchName,
  });

  const handleSave = () => {
    onUpdateContact(editName.trim(), editPhone.trim());
    setIsEditing(false);
  };

  return (
    <div className="teleprompter">
      <div className="teleprompter-content">{scriptNodes}</div>
      
      <div className="contact-info">
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
            <input
              type="text"
              className="contact-edit-input"
              placeholder="Contact Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <input
              type="tel"
              className="contact-edit-input"
              placeholder="Phone Number"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
            />
            <div className="contact-edit-actions">
              <button type="button" className="btn-edit-save" onClick={handleSave}>
                Save
              </button>
              <button type="button" className="btn-edit-cancel" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p><strong>{currentRecord.name || 'Unknown Contact'}</strong></p>
            <p className="text-muted">{currentRecord.phone || 'No phone number'}</p>
            <button 
              type="button" 
              className="btn-edit-trigger" 
              onClick={() => setIsEditing(true)}
            >
              <Pencil size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Edit Name / Number
            </button>
          </>
        )}
      </div>

      {!isEditing && (
        currentRecord.phone ? (
          <a href={`tel:${currentRecord.phone}`} className="call-button" aria-label={`Call ${currentRecord.name}`}>
            <PhoneCall size={18} />
            <span>Call Now</span>
          </a>
        ) : (
          <button type="button" className="call-button" disabled>
            <PhoneCall size={18} />
            <span>No Phone Number</span>
          </button>
        )
      )}
    </div>
  );
}