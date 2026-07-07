import { useRef, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { CampaignRecord } from '../types';

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

      const transformed = rows
        .map((row, index) => ({
          id: index,
          congregantId: index,
          name: String(row[nameCol] ?? '').trim(),
          phone: normalizePhone(row[phoneCol]),
          status: '',
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
      />
      <div className="upload-icon"><Upload size={36} /></div>
      <h2>Upload Congregant List</h2>
      <p>Drag and drop your CSV/XLSX file here, or click to browse.</p>
      <p className="help-text"><FileSpreadsheet size={14} /> Supported columns: Name, Phone, Contact</p>
    </div>
  );
}
