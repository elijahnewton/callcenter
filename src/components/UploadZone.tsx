import { useRef, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Upload, CheckCircle2, ShieldAlert, PhoneCall, Save } from 'lucide-react';
import type { CampaignRecord, CallStatus } from '../types';

interface UploadZoneProps {
  onRecordsParsed: (records: CampaignRecord[]) => Promise<void>;
  onAlert: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50000;

function fuzzyMatch(value: string, patterns: string[]) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function normalizePhone(phone: unknown) {
  if (phone === null || phone === undefined) return '';
  return String(phone).replace(/[^+\d]/g, '');
}

export function UploadZone({ onRecordsParsed, onAlert }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const parseFile = async (file: File) => {
    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.csv') && !filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      onAlert('Please upload a CSV or Excel file.', 'error');
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      onAlert('File is too large. Please use a file smaller than 5 MB.', 'error');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

      if (rows.length === 0) {
        onAlert('No data found in the uploaded file.', 'error');
        return;
      }

      if (rows.length > MAX_ROWS) {
        onAlert('File contains too many rows. Please split the file and try again.', 'error');
        return;
      }

      const firstRowColumns = Object.keys(rows[0]);
      const nameCol = firstRowColumns.find((column) =>
        fuzzyMatch(column, ['name', 'fullname', 'membername', 'congregant']),
      );
      const phoneCol = firstRowColumns.find((column) =>
        fuzzyMatch(column, ['phone', 'contact', 'telephone', 'mobile', 'number']),
      );

      if (!nameCol || !phoneCol) {
        onAlert('Could not detect name and phone columns.', 'error');
        return;
      }

      const transformed: CampaignRecord[] = rows
        .map((row, index) => ({
          id: index,
          congregantId: index,
          name: String(row[nameCol] ?? '').trim(),
          phone: normalizePhone(row[phoneCol]),
          status: '' as CallStatus,
          notes: '',
          customResponse: '',
        }))
        .filter((record) => record.name.length > 0 || record.phone.length > 0);

      if (transformed.length === 0) {
        onAlert('Uploaded file did not produce usable records.', 'error');
        return;
      }

      await onRecordsParsed(transformed);
      onAlert(`Loaded ${transformed.length} records successfully.`, 'success');
    } catch (error) {
      onAlert(`Error parsing file: ${(error as Error).message}`, 'error');
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    const file = event.dataTransfer.files[0];
    if (file) {
      await parseFile(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
  };

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto', padding: '1rem' }}>
      {/* Interactive Drop Zone Area */}
      <div
        className="upload-zone"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            inputRef.current?.click();
          }
        }}
        style={{
          border: '2px dashed var(--primary)',
          borderRadius: '12px',
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          backgroundColor: 'var(--neutral-100)',
          cursor: 'pointer', // Fixed syntax error here
          transition: 'all 0.2s ease',
          marginBottom: '2rem'
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) {
              await parseFile(file);
              event.currentTarget.value = '';
            }
          }}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'inline-flex', padding: '1rem', background: '#eef2ff', borderRadius: '50%', color: 'var(--primary)', marginBottom: '1rem' }}>
          <Upload size={32} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--neutral-900)' }}>
          Upload Your Campaign List
        </h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--neutral-600)', marginBottom: '0.75rem' }}>
          Drag and drop your spreadsheet here, or click to browse files.
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', background: '#ffffff', padding: '0.4rem 0.8rem', borderRadius: '20px', border: '1px solid var(--neutral-200)', color: 'var(--neutral-600)' }}>
          <FileSpreadsheet size={14} style={{ color: 'var(--success)' }} />
          <span>Auto-detects columns looking like <strong>Name</strong> and <strong>Phone</strong></span>
        </div>
      </div>

      {/* Explanatory Guide Box */}
      <div style={{ background: '#ffffff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid var(--neutral-200)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--neutral-800)', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.5rem' }}>
          💡 How to Use This Application
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ color: 'var(--primary)', marginTop: '2px' }}><CheckCircle2 size={18} /></div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--neutral-900)' }}>1. Prepare Your Spreadsheet</h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--neutral-600)', marginTop: '0.15rem' }}>
                Your Excel or CSV file just needs two basic columns. The system automatically scans for column headers like <em>Name, Full Name, Phone, Contact, or Mobile</em>.
                <b>NOTE:</b> The Document should  <b>NOT</b> have a heading line eg. List of members.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ color: 'var(--success)', marginTop: '2px' }}><PhoneCall size={18} /></div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--neutral-900)' }}>2. Call with One Tap</h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--neutral-600)', marginTop: '0.15rem' }}>
                The workspace guides you through the sheet contact by contact. Tap the <strong>Call Now</strong> button to launch your device's native phone dialer immediately without jumping between windows.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ color: 'var(--warning)', marginTop: '2px' }}><Save size={18} /></div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--neutral-900)' }}>3. Log Responses & Export Progress</h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--neutral-600)', marginTop: '0.15rem' }}>
                Select an outcome from the dropdown menu and type extra prayer requests or remarks. Your progress automatically saves to the device. Click the disk icon anytime or finish the list to export an updated Excel report tracking all details.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            <div style={{ color: '#6366f1', marginTop: '2px' }}><ShieldAlert size={18} /></div>
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--neutral-800)' }}>🔒 Private & 100% Offline</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--neutral-600)', marginTop: '0.15rem', lineHeight: '1.4' }}>
                Once this webpage is initially loaded, it operates completely offline. Your contact sheets and logged details are processed locally in your browser memory and are <strong>never</strong> transmitted over the internet or sent to an external server.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
