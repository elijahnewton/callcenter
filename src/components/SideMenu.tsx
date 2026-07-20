import { X, Phone, PhoneOff, BarChart3, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import type { CampaignRecord } from '../types';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  records: CampaignRecord[];
  onSelectContact: (index: number) => void;
  onClearMemory: () => void;
  onShowReport: () => void;
  currentRecordIndex: number;
}

type FilterTab = 'all' | 'called' | 'notcalled';

export function SideMenu({
  isOpen,
  onClose,
  records,
  onSelectContact,
  onClearMemory,
  onShowReport,
  currentRecordIndex,
}: SideMenuProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Fixed TS2367: checking truthiness instead of comparing to ''
  const calledRecords = records.filter((r) => !!r.status);
  const notCalledRecords = records.filter((r) => !r.status);

  const getFilteredRecords = (): Array<{ record: CampaignRecord; originalIndex: number }> => {
    switch (activeTab) {
      case 'called':
        return calledRecords.map((record) => ({
          record,
          originalIndex: records.indexOf(record),
        }));
      case 'notcalled':
        return notCalledRecords.map((record) => ({
          record,
          originalIndex: records.indexOf(record),
        }));
      default:
        return records.map((record, index) => ({ record, originalIndex: index }));
    }
  };

  const filteredRecords = getFilteredRecords();

  const getStatusDisplay = (record: CampaignRecord): string => {
    if (!record.status) return 'Not Called';
    const statusLabels: Record<string, string> = {
      yes: 'Yes',
      no: 'No',
      notpicking: 'Not Picking',
      phoneoff: 'Phone Off',
      changedaddr: 'Changed Address',
      other: record.customResponse || 'Other',
    };
    return statusLabels[record.status] || record.status;
  };

  const getStatusColor = (record: CampaignRecord): string => {
    if (!record.status) return 'var(--neutral-400)';
    const colors: Record<string, string> = {
      yes: 'var(--success)',
      no: 'var(--error)',
      notpicking: 'var(--warning)',
      phoneoff: 'var(--warning)',
      changedaddr: 'var(--info)',
      other: 'var(--neutral-500)',
    };
    return colors[record.status] || 'var(--neutral-500)';
  };

  const handleClearMemory = () => {
    if (showClearConfirm) {
      onClearMemory();
      setShowClearConfirm(false);
    } else {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
    }
  };

  return (
    <>
      <div
        className={`menu-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`side-menu ${isOpen ? 'open' : ''}`} role="dialog" aria-label="Contacts menu">
        <div className="menu-header">
          <h2>Contacts</h2>
          <button className="menu-close-btn" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <div className="menu-stats">
          <div className="menu-stat-item">
            <span className="stat-number">{records.length}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="menu-stat-item called">
            <span className="stat-number">{calledRecords.length}</span>
            <span className="stat-label">Called</span>
          </div>
          <div className="menu-stat-item not-called">
            <span className="stat-number">{notCalledRecords.length}</span>
            <span className="stat-label">Not Called</span>
          </div>
        </div>

        <div className="menu-tabs">
          <button
            className={`menu-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All ({records.length})
          </button>
          <button
            className={`menu-tab ${activeTab === 'called' ? 'active' : ''}`}
            onClick={() => setActiveTab('called')}
          >
            <UserCheck size={14} />
            Called ({calledRecords.length})
          </button>
          <button
            className={`menu-tab ${activeTab === 'notcalled' ? 'active' : ''}`}
            onClick={() => setActiveTab('notcalled')}
          >
            <UserX size={14} />
            Not Called ({notCalledRecords.length})
          </button>
        </div>

        <div className="menu-contact-list">
          {filteredRecords.length === 0 ? (
            <div className="menu-empty">
              <p>No contacts {activeTab === 'called' ? 'have been called yet' : activeTab === 'notcalled' ? 'remaining to call' : 'loaded'}</p>
            </div>
          ) : (
            filteredRecords.map(({ record, originalIndex }) => (
              <button
                key={record.id}
                className={`menu-contact-item ${originalIndex === currentRecordIndex ? 'current' : ''} ${record.status ? 'called' : 'not-called'}`}
                onClick={() => {
                  onSelectContact(originalIndex);
                  onClose();
                }}
              >
                <div className="contact-item-icon">
                  {record.status ? (
                    <Phone size={14} />
                  ) : (
                    <PhoneOff size={14} />
                  )}
                </div>
                <div className="contact-item-info">
                  <span className="contact-item-name">
                    {record.name || 'Unknown'}
                  </span>
                  <span className="contact-item-phone">
                    {record.phone || 'No number'}
                  </span>
                </div>
                <div className="contact-item-status">
                  <span
                    className="status-badge"
                    style={{ color: getStatusColor(record), borderColor: getStatusColor(record) }}
                  >
                    {getStatusDisplay(record)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="menu-footer">
          <button className="menu-footer-btn report-btn" onClick={onShowReport}>
            <BarChart3 size={16} />
            <span>View Report</span>
          </button>
          <button
            className={`menu-footer-btn clear-btn ${showClearConfirm ? 'confirm' : ''}`}
            onClick={handleClearMemory}
            disabled={records.length === 0}
          >
            <Trash2 size={16} />
            <span>{showClearConfirm ? 'Click again to confirm' : 'Clear Memory'}</span>
          </button>
        </div>
      </aside>
    </>
  );
}