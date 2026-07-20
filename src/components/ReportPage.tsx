import { ArrowLeft, Download, UserCheck, UserX, Phone, PhoneOff, CheckCircle2, XCircle, MapPin, HelpCircle } from 'lucide-react';
import type { CampaignRecord } from '../types';

interface ReportPageProps {
  records: CampaignRecord[];
  onBack: () => void;
  onDownloadReport: () => void;
}

interface StatusCount {
  label: string;
  count: number;
  color: string;
  icon: React.ReactNode;
}

export function ReportPage({ records, onBack, onDownloadReport }: ReportPageProps) {
  const totalRecords = records.length;
  // Fixed TS2367: checking truthiness instead of comparing to ''
  const calledRecords = records.filter((r) => !!r.status);
  const notCalledRecords = records.filter((r) => !r.status);
  const calledCount = calledRecords.length;
  const notCalledCount = notCalledRecords.length;
  const completionRate = totalRecords > 0 ? Math.round((calledCount / totalRecords) * 100) : 0;

  const statusCounts: StatusCount[] = [
    {
      label: 'Yes',
      count: records.filter((r) => r.status === 'yes').length,
      color: 'var(--success)',
      icon: <CheckCircle2 size={16} />,
    },
    {
      label: 'No',
      count: records.filter((r) => r.status === 'no').length,
      color: 'var(--error)',
      icon: <XCircle size={16} />,
    },
    {
      label: 'Not Picking',
      count: records.filter((r) => r.status === 'notpicking').length,
      color: 'var(--warning)',
      icon: <PhoneOff size={16} />,
    },
    {
      label: 'Phone Off',
      count: records.filter((r) => r.status === 'phoneoff').length,
      color: '#f59e0b',
      icon: <PhoneOff size={16} />,
    },
    {
      label: 'Changed Address',
      count: records.filter((r) => r.status === 'changedaddr').length,
      color: 'var(--info)',
      icon: <MapPin size={16} />,
    },
    {
      label: 'Other',
      count: records.filter((r) => r.status === 'other').length,
      color: 'var(--neutral-500)',
      icon: <HelpCircle size={16} />,
    },
    {
      label: 'Not Called',
      count: notCalledCount,
      color: 'var(--neutral-300)',
      icon: <UserX size={16} />,
    },
  ];

  const maxStatusCount = Math.max(...statusCounts.map((s) => s.count), 1);

  const yesCount = records.filter((r) => r.status === 'yes').length;
  const yesRate = calledCount > 0 ? Math.round((yesCount / calledCount) * 100) : 0;

  return (
    <div className="report-page">
      <div className="report-header">
        <button className="report-back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>Back to Calling</span>
        </button>
        <h1>Campaign Report</h1>
        <button className="report-download-btn" onClick={onDownloadReport}>
          <Download size={16} />
          <span>Export Excel</span>
        </button>
      </div>

      <div className="report-summary-cards">
        <div className="summary-card total">
          <div className="summary-card-icon">
            <Phone size={24} />
          </div>
          <div className="summary-card-content">
            <span className="summary-card-number">{totalRecords.toLocaleString()}</span>
            <span className="summary-card-label">Total Contacts</span>
          </div>
        </div>

        <div className="summary-card called">
          <div className="summary-card-icon">
            <UserCheck size={24} />
          </div>
          <div className="summary-card-content">
            <span className="summary-card-number">{calledCount.toLocaleString()}</span>
            <span className="summary-card-label">Called</span>
          </div>
        </div>

        <div className="summary-card not-called">
          <div className="summary-card-icon">
            <UserX size={24} />
          </div>
          <div className="summary-card-content">
            <span className="summary-card-number">{notCalledCount.toLocaleString()}</span>
            <span className="summary-card-label">Not Called</span>
          </div>
        </div>

        <div className="summary-card rate">
          <div className="summary-card-icon">
            <CheckCircle2 size={24} />
          </div>
          <div className="summary-card-content">
            <span className="summary-card-number">{completionRate}%</span>
            <span className="summary-card-label">Completion</span>
          </div>
        </div>
      </div>

      <div className="report-ring-section">
        <div className="completion-ring-container">
          <svg viewBox="0 0 120 120" className="completion-ring">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="var(--neutral-200)"
              strokeWidth="10"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(completionRate / 100) * 314.16} 314.16`}
              transform="rotate(-90 60 60)"
              className="ring-progress"
            />
            <text x="60" y="55" textAnchor="middle" className="ring-text-large">
              {completionRate}%
            </text>
            <text x="60" y="72" textAnchor="middle" className="ring-text-small">
              Complete
            </text>
          </svg>
        </div>

        {calledCount > 0 && (
          <div className="yes-rate-box">
            <div className="yes-rate-number">{yesRate}%</div>
            <div className="yes-rate-label">Positive Response Rate</div>
            <div className="yes-rate-detail">
              {yesCount} of {calledCount} called contacts said Yes
            </div>
          </div>
        )}
      </div>

      <div className="report-chart-section">
        <h2>Status Distribution</h2>
        <div className="bar-chart">
          {statusCounts.map((status) => (
            <div key={status.label} className="bar-chart-row">
              <div className="bar-chart-label">
                <span style={{ color: status.color }}>{status.icon}</span>
                <span>{status.label}</span>
              </div>
              <div className="bar-chart-bar-container">
                <div
                  className="bar-chart-bar"
                  style={{
                    width: `${(status.count / maxStatusCount) * 100}%`,
                    backgroundColor: status.color,
                  }}
                />
              </div>
              <div className="bar-chart-value" style={{ color: status.color }}>
                {status.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="report-chart-section">
        <h2>Response Breakdown</h2>
        {calledCount > 0 ? (
          <div className="pie-section">
            <div
              className="pie-chart"
              style={{
                background: `conic-gradient(
                  var(--success) 0deg ${(yesCount / calledCount) * 360}deg,
                  var(--error) ${(yesCount / calledCount) * 360}deg ${((yesCount + records.filter(r => r.status === 'no').length) / calledCount) * 360}deg,
                  var(--warning) ${((yesCount + records.filter(r => r.status === 'no').length) / calledCount) * 360}deg ${((yesCount + records.filter(r => r.status === 'no').length + records.filter(r => r.status === 'notpicking').length) / calledCount) * 360}deg,
                  #f59e0b ${((yesCount + records.filter(r => r.status === 'no').length + records.filter(r => r.status === 'notpicking').length) / calledCount) * 360}deg ${((yesCount + records.filter(r => r.status === 'no').length + records.filter(r => r.status === 'notpicking').length + records.filter(r => r.status === 'phoneoff').length) / calledCount) * 360}deg,
                  var(--info) ${((yesCount + records.filter(r => r.status === 'no').length + records.filter(r => r.status === 'notpicking').length + records.filter(r => r.status === 'phoneoff').length) / calledCount) * 360}deg ${((yesCount + records.filter(r => r.status === 'no').length + records.filter(r => r.status === 'notpicking').length + records.filter(r => r.status === 'phoneoff').length + records.filter(r => r.status === 'changedaddr').length) / calledCount) * 360}deg,
                  var(--neutral-400) ${((yesCount + records.filter(r => r.status === 'no').length + records.filter(r => r.status === 'notpicking').length + records.filter(r => r.status === 'phoneoff').length + records.filter(r => r.status === 'changedaddr').length) / calledCount) * 360}deg 360deg
                )`,
              }}
            />
            <div className="pie-legend">
              <div className="pie-legend-item">
                <span className="legend-dot" style={{ backgroundColor: 'var(--success)' }} />
                <span>Yes ({yesCount})</span>
              </div>
              <div className="pie-legend-item">
                <span className="legend-dot" style={{ backgroundColor: 'var(--error)' }} />
                <span>No ({records.filter(r => r.status === 'no').length})</span>
              </div>
              <div className="pie-legend-item">
                <span className="legend-dot" style={{ backgroundColor: 'var(--warning)' }} />
                <span>Not Picking ({records.filter(r => r.status === 'notpicking').length})</span>
              </div>
              <div className="pie-legend-item">
                <span className="legend-dot" style={{ backgroundColor: '#f59e0b' }} />
                <span>Phone Off ({records.filter(r => r.status === 'phoneoff').length})</span>
              </div>
              <div className="pie-legend-item">
                <span className="legend-dot" style={{ backgroundColor: 'var(--info)' }} />
                <span>Changed Addr ({records.filter(r => r.status === 'changedaddr').length})</span>
              </div>
              <div className="pie-legend-item">
                <span className="legend-dot" style={{ backgroundColor: 'var(--neutral-400)' }} />
                <span>Other ({records.filter(r => r.status === 'other').length})</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="report-empty-chart">No calls have been made yet.</p>
        )}
      </div>

      <div className="report-chart-section">
        <h2>Recent Calls</h2>
        <div className="recent-calls-list">
          {calledRecords.length === 0 ? (
            <p className="report-empty-chart">No calls logged yet.</p>
          ) : (
            calledRecords
              .slice()
              .reverse()
              .slice(0, 20)
              .map((record) => {
                const statusColor = statusCounts.find((s) => {
                  if (s.label === 'Other') return record.status === 'other';
                  return s.label.toLowerCase().replace(/\s/g, '') === record.status?.replace(/\s/g, '');
                })?.color || 'var(--neutral-500)';

                return (
                  <div key={record.id} className="recent-call-item">
                    <div className="recent-call-info">
                      <span className="recent-call-name">{record.name || 'Unknown'}</span>
                      <span className="recent-call-phone">{record.phone || '—'}</span>
                    </div>
                    <span className="recent-call-status" style={{ color: statusColor }}>
                      {record.status === 'other' ? record.customResponse || 'Other' : statusCounts.find(s => {
                        if (s.label === 'Other') return false;
                        return s.label.toLowerCase().replace(/\s/g, '') === record.status?.replace(/\s/g, '');
                      })?.label || record.status}
                    </span>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {records.length > 0 && (
        <div className="report-footer-download">
          <button className="report-footer-btn" onClick={onDownloadReport}>
            <Download size={18} />
            <span>Download Full Report</span>
          </button>
        </div>
      )}
    </div>
  );
}