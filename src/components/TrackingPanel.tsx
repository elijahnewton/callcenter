import { Download } from 'lucide-react';
import type { CampaignRecord, CallStatus } from '../types';

interface TrackingPanelProps {
  record: CampaignRecord;
  currentIndex: number;
  totalRecords: number;
  onUpdateRecord: (field: 'status' | 'customResponse' | 'notes', value: string) => Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  onComplete: () => void;
  onDownloadReport: () => void;
}

const STATUS_OPTIONS: Array<{ value: CallStatus; label: string }> = [
  { value: '' as CallStatus, label: '-- Select Call Outcome --' },
  { value: 'yes' as CallStatus, label: 'Yes' },
  { value: 'no' as CallStatus, label: 'No' },
  { value: 'notpicking' as CallStatus, label: 'Not Picking' },
  { value: 'phoneoff' as CallStatus, label: 'Phone Off' },
  { value: 'changedaddr' as CallStatus, label: 'Changed Address' },
  { value: 'other' as CallStatus, label: 'Other' },
];

export function TrackingPanel({
  record,
  currentIndex,
  totalRecords,
  onUpdateRecord,
  onPrevious,
  onNext,
  onComplete,
  onDownloadReport,
}: TrackingPanelProps) {
  const isLastRecord = currentIndex === totalRecords - 1;

  return (
    <div className="tracking-panel">
      <div className="tracking-section">
        <h3>Call Status</h3>
        <select
          className="status-dropdown"
          value={record.status || ''}
          onChange={async (event) => {
            const selectedValue = event.target.value as CallStatus;
            await onUpdateRecord('status', selectedValue);
            if (selectedValue !== 'other') {
              await onUpdateRecord('customResponse', '');
            }
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} disabled={option.value === ''}>
              {option.label}
            </option>
          ))}
        </select>

        {record.status === 'other' && (
          <div className="custom-response">
            <input
              type="text"
              placeholder="Describe the outcome..."
              value={record.customResponse || ''}
              onChange={async (event) => onUpdateRecord('customResponse', event.target.value)}
            />
          </div>
        )}
      </div>

      <div className="tracking-section notes-area">
        <label htmlFor="call-notes" className="notes-label">Notes &amp; Prayer Requests</label>
        <textarea
          id="call-notes"
          placeholder="Add notes, prayer requests, or follow-up details..."
          value={record.notes || ''}
          onChange={async (event) => onUpdateRecord('notes', event.target.value)}
        />
      </div>

      <div className="navigation">
        <button type="button" className="nav-button secondary" onClick={onPrevious} disabled={currentIndex === 0}>
          Previous
        </button>
        
        <div className="nav-actions-right">
          <button
            type="button"
            className="nav-button download"
            onClick={onDownloadReport}
            title="Download report without completing"
          >
            <Download size={16} />
            <span>Download</span>
          </button>
          
          {isLastRecord ? (
            <button type="button" className="nav-button success" onClick={onComplete}>
              Finish List
            </button>
          ) : (
            <button type="button" className="nav-button primary" onClick={onNext}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}