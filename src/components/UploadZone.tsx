import { useRef, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Upload, CheckCircle2, ShieldAlert, PhoneCall, Save, Search } from 'lucide-react';
import type { CampaignRecord, CallStatus } from '../types';

interface UploadZoneProps {
  onRecordsParsed: (records: CampaignRecord[]) => Promise<void>;
  onAlert: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50000;
const HEADER_SCAN_ROWS = 25; // Scan up to 25 rows for headers
const HEADER_SCAN_COLS = 100; // Scan up to 100 columns for headers

function fuzzyMatch(value: string, patterns: string[]) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function normalizePhone(phone: unknown) {
  if (phone === null || phone === undefined) return '';
  return String(phone).replace(/[^+\d]/g, '');
}

interface HeaderSearchResult {
  nameColIndex: number;
  phoneColIndex: number;
  dataStartRow: number;
  headerRowFound: number;
}

function findHeaders(rawData: unknown[][]): HeaderSearchResult | null {
  // Strategy 1: Find a row that contains BOTH headers
  for (let r = 0; r < Math.min(HEADER_SCAN_ROWS, rawData.length); r++) {
    const row = rawData[r];
    if (!row) continue;

    let tempNameIdx = -1;
    let tempPhoneIdx = -1;

    for (let c = 0; c < Math.min(HEADER_SCAN_COLS, row.length); c++) {
      const cellVal = row[c];
      if (cellVal === null || cellVal === undefined || cellVal === '') continue;

      const cellStr = String(cellVal).trim();
      if (!cellStr) continue;

      if (tempNameIdx === -1 && fuzzyMatch(cellStr, ['name', 'fullname', 'membername', 'congregant', 'firstname', 'lastname', 'customername', 'clientname'])) {
        tempNameIdx = c;
      }
      if (tempPhoneIdx === -1 && fuzzyMatch(cellStr, ['phone', 'contact', 'telephone', 'mobile', 'cell', 'phonenumber', 'contactnumber', 'mobilenumber', 'tel'])) {
        tempPhoneIdx = c;
      }
    }

    if (tempNameIdx !== -1 && tempPhoneIdx !== -1) {
      return {
        nameColIndex: tempNameIdx,
        phoneColIndex: tempPhoneIdx,
        dataStartRow: r + 1,
        headerRowFound: r,
      };
    }
  }

  // Strategy 2: Headers might be in DIFFERENT rows (e.g., due to merged cells or multi-row headers)
  // Find name header in any row, find phone header in any row, use the max row + 1 as data start
  let nameResult: { row: number; col: number } | null = null;
  let phoneResult: { row: number; col: number } | null = null;

  for (let r = 0; r < Math.min(HEADER_SCAN_ROWS, rawData.length); r++) {
    const row = rawData[r];
    if (!row) continue;

    for (let c = 0; c < Math.min(HEADER_SCAN_COLS, row.length); c++) {
      const cellVal = row[c];
      if (cellVal === null || cellVal === undefined || cellVal === '') continue;

      const cellStr = String(cellVal).trim();
      if (!cellStr) continue;

      if (!nameResult && fuzzyMatch(cellStr, ['name', 'fullname', 'membername', 'congregant', 'firstname', 'lastname', 'customername', 'clientname'])) {
        nameResult = { row: r, col: c };
      }
      if (!phoneResult && fuzzyMatch(cellStr, ['phone', 'contact', 'telephone', 'mobile', 'cell', 'phonenumber', 'contactnumber', 'mobilenumber', 'tel'])) {
        phoneResult = { row: r, col: c };
      }
    }
  }

  if (nameResult && phoneResult) {
    return {
      nameColIndex: nameResult.col,
      phoneColIndex: phoneResult.col,
      dataStartRow: Math.max(nameResult.row, phoneResult.row) + 1,
      headerRowFound: Math.max(nameResult.row, phoneResult.row),
    };
  }

  return null;
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

      // Read as 2D array to manually scan for headers
      // This preserves structure even with merged cells or messy formatting
      const rawData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: '',
      });

      if (rawData.length === 0) {
        onAlert('No data found in the uploaded file.', 'error');
        return;
      }

      // Scan for headers across multiple rows
      const headerResult = findHeaders(rawData);

      if (!headerResult) {
        onAlert(
          `Could not detect name and phone columns in the first ${HEADER_SCAN_ROWS} rows. ` +
          `Please ensure your file has columns with headers like "Name" and "Phone".`,
          'error'
        );
        return;
      }

      const { nameColIndex, phoneColIndex, dataStartRow, headerRowFound } = headerResult;

      // Calculate available data rows
      const availableDataRows = rawData.length - dataStartRow;

      if (availableDataRows <= 0) {
        onAlert('Found headers but no data rows below them.', 'error');
        return;
      }

      if (availableDataRows > MAX_ROWS) {
        onAlert(
          `File contains ${availableDataRows.toLocaleString()} data rows (max ${MAX_ROWS.toLocaleString()}). ` +
          `Please split the file and try again.`,
          'error'
        );
        return;
      }

      // Extract data starting from the row after headers
      const transformed: CampaignRecord[] = [];

      for (let r = dataStartRow; r < rawData.length; r++) {
        const row = rawData[r];
        if (!row) continue;

        // Safely access cells - they might not exist if row is shorter
        const nameRaw = row[nameColIndex];
        const phoneRaw = row[phoneColIndex];

        const name = String(nameRaw ?? '').trim();
        const phone = normalizePhone(phoneRaw);

        // Skip completely empty rows
        if (!name && !phone) continue;

        transformed.push({
          id: transformed.length,
          congregantId: transformed.length,
          name,
          phone,
          status: '' as CallStatus,
          notes: '',
          customResponse: '',
        });
      }

      if (transformed.length === 0) {
        onAlert('Found headers but no usable data in the rows below.', 'error');
        return;
      }

      await onRecordsParsed(transformed);
      
      // Inform user about header detection
      const headerNote = headerRowFound > 0
        ? ` (headers found in row ${headerRowFound + 1})`
        : '';
      
      onAlert(
        `Loaded ${transformed.length.toLocaleString()} records successfully${headerNote}.`,
        'success'
      );
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
          cursor: 'pointer',
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
          <span>Smart scan finds headers even with title rows or merged cells</span>
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
              <p style={{ fontSize: '0.825rem', color: 'var(--neutral-600)', marginTop: '0.15rem', lineHeight: '1.5' }}>
                Your file just needs columns containing names and phone numbers. The system scans up to <strong>25 rows</strong> and <strong>100 columns</strong> to find headers like <em>Name, Full Name, Phone, Contact, Mobile</em>, etc.—even if your file has a title row or merged header cells.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ color: '#8b5cf6', marginTop: '2px' }}><Search size={18} /></div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--neutral-900)' }}>1b. Handles Messy Files</h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--neutral-600)', marginTop: '0.15rem', lineHeight: '1.5' }}>
                No need to clean up your file first! The scanner will skip over title rows like "Church Member List 2024", handle merged cells, and find your data columns regardless of where they are positioned.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ color: 'var(--success)', marginTop: '2px' }}><PhoneCall size={18} /></div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--neutral-900)' }}>2. Call with One Tap</h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--neutral-600)', marginTop: '0.15rem', lineHeight: '1.5' }}>
                The workspace guides you through the sheet contact by contact. Tap the <strong>Call Now</strong> button to launch your device's native phone dialer immediately without jumping between windows.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ color: 'var(--warning)', marginTop: '2px' }}><Save size={18} /></div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--neutral-900)' }}>3. Log Responses & Export Progress</h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--neutral-600)', marginTop: '0.15rem', lineHeight: '1.5' }}>
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