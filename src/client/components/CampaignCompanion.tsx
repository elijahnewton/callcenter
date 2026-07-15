import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { ArrowLeft, Camera, Sparkles, FileSpreadsheet, FileText, Play, Info } from 'lucide-react';
import './CampaignCompanion.css';

interface CampaignCompanionProps {
  onBack: () => void;
}

const LOCAL_API_ENDPOINT = '/api/companion';

// --- Validation constants ---
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;   // 5 MB
const MAX_SHEET_SIZE = 10 * 1024 * 1024;  // 10 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_SHEET_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const REQUEST_TIMEOUT_MS = 60_000; // 60 seconds

export default function CampaignCompanion({ onBack }: CampaignCompanionProps) {
  const [activeTab, setActiveTab] = useState<'ocr' | 'sanitize'>('ocr');
  const [channel, setChannel] = useState<'sms' | 'email' | 'call'>('sms');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<'xlsx' | 'csv'>('xlsx');

  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' | '' }>({ message: '', type: '' });

  const ocrInputRef = useRef<HTMLInputElement>(null);
  const sanitizeInputRef = useRef<HTMLInputElement>(null);

  // AbortController for cancelling in‑flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount: abort any ongoing request
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const switchTab = (tab: 'ocr' | 'sanitize') => {
    // Cancel any in‑flight request when switching tabs
    abortControllerRef.current?.abort();
    setActiveTab(tab);
    setSelectedFile(null);
    setImageBase64(null);
    setImagePreview(null);
    setStatus({ message: '', type: '' });
  };

  // ---------- Image selection with validation ----------
  const handleImageSelection = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setStatus({ message: 'Invalid file type. Please upload a JPG, PNG, or WebP image.', type: 'error' });
      // Clear the input so the same invalid file can be re‑selected
      e.target.value = '';
      return;
    }
    // Validate size
    if (file.size > MAX_IMAGE_SIZE) {
      setStatus({ message: 'Image is too large. Maximum size is 5 MB.', type: 'error' });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);
      setImageBase64(result.split(',')[1]);
      setStatus({ message: 'Image loaded. Ready to run Workers AI OCR.', type: 'info' });
    };
    reader.onerror = () => {
      setStatus({ message: 'Failed to read the image file.', type: 'error' });
    };
    reader.readAsDataURL(file);
  };

  // ---------- Spreadsheet selection with validation ----------
  const handleSheetSelection = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type (by extension or MIME)
    const isValid = ALLOWED_SHEET_TYPES.includes(file.type) ||
      file.name.endsWith('.csv') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.xlsx');

    if (!isValid) {
      setStatus({ message: 'Invalid file type. Please upload a CSV or Excel file.', type: 'error' });
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SHEET_SIZE) {
      setStatus({ message: 'File is too large. Maximum size is 10 MB.', type: 'error' });
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    setStatus({ message: `Loaded ${file.name}. Ready to normalize roster properties.`, type: 'info' });
  };

  // ---------- Download helper ----------
  const triggerLocalDownload = (data: any[]) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Campaign List");

    const dateStr = new Date().toISOString().slice(0, 10);

    if (outputFormat === 'xlsx') {
      XLSX.writeFile(workbook, `Cleaned_Campaign_${dateStr}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `Cleaned_Campaign_${dateStr}.csv`, { bookType: 'csv' });
    }
  };

  // ---------- Main processing pipeline ----------
  const executeProcessorPipeline = async () => {
    // Abort previous request if any
    abortControllerRef.current?.abort();

    // Create a new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Set a timeout that aborts after REQUEST_TIMEOUT_MS
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setIsProcessing(true);
    setStatus({ message: 'Hono Backend is communicating with Workers AI...', type: 'info' });

    try {
      let parsedResultJson: any[] = [];

      if (activeTab === 'ocr') {
        if (!imageBase64) throw new Error("No image selected");

        const response = await fetch(LOCAL_API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ocr',
            channel,
            image: imageBase64
          }),
          signal: controller.signal,   // <-- abort if tab changes or timeout
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || 'Worker OCR pipeline failed.');
        }
        const result = await response.json();
        parsedResultJson = result.data;

      } else {
        if (!selectedFile) throw new Error("No file selected");

        const buffer = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(worksheet);

        const response = await fetch(LOCAL_API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sanitize',
            channel,
            text: JSON.stringify(rawRows)
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || 'Hono normalization pipeline failed.');
        }
        const result = await response.json();
        parsedResultJson = result.data;
      }

      if (!parsedResultJson || parsedResultJson.length === 0) {
        throw new Error('AI engine returned no structured records. Try another file.');
      }

      triggerLocalDownload(parsedResultJson);
      setStatus({ message: `Success! Worker processed ${parsedResultJson.length} records.`, type: 'success' });

    } catch (error: any) {
      // Ignore errors caused by intentional abort
      if (error.name === 'AbortError') {
        setStatus({ message: 'Request was cancelled.', type: 'info' });
      } else {
        console.error(error);
        setStatus({ message: `Operation Failed: ${error.message}`, type: 'error' });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsProcessing(false);
      // Clean up the controller ref if it's still this one
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const isSubmitDisabled = isProcessing || (activeTab === 'ocr' && !imageBase64) || (activeTab === 'sanitize' && !selectedFile);

  // ---------- JSX unchanged except for adding key to channel buttons ----------
  return (
    <div className="campaign-body">
      <div className="container">
        <div onClick={onBack} className="back-link" style={{ cursor: 'pointer', display: 'inline-flex' }}>
          <ArrowLeft size={18} /> Return to Local Call Center
        </div>

        <div className="header">
          <h1>Campaign Data Companion</h1>
          <p>Convert handwriting photos or format problematic rosters using Workers AI bound natively inside Hono</p>
        </div>

        <div className="channel-select-group" style={{ marginBottom: '20px' }}>
          <p style={{ fontWeight: 700, marginBottom: '8px', fontSize: '0.9rem' }}>Campaign Mode:</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {['sms', 'email', 'call'].map((mode) => (
              <button
                key={mode}
                className={`tab-btn ${channel === mode ? 'active' : ''}`}
                onClick={() => setChannel(mode as any)}
                style={{ padding: '8px 16px', textTransform: 'uppercase', fontSize: '0.8rem' }}
              >
                {mode} Mode
              </button>
            ))}
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'ocr' ? 'active' : ''}`}
            onClick={() => switchTab('ocr')}
          >
            <Camera size={18} /> Vision OCR (Llama 3.2)
          </button>
          <button
            className={`tab-btn ${activeTab === 'sanitize' ? 'active' : ''}`}
            onClick={() => switchTab('sanitize')}
          >
            <Sparkles size={18} /> Auto-Sanitize (Llama 3.1)
          </button>
        </div>

        <div className="card">
          {activeTab === 'ocr' && (
            <div id="panel-ocr">
              <h2>Handwritten List Extractor</h2>
              <p className="description">Snap a sharp photo of pen-and-paper sign-up lists. Cloudflare's Edge Vision model will isolate text characters and normalize the fields.</p>

              <div className="dropzone" onClick={() => ocrInputRef.current?.click()}>
                <input type="file" ref={ocrInputRef} accept="image/*" onChange={handleImageSelection} />
                <div className="dropzone-icon"><Camera size={24} /></div>
                <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>Capture Photo or Select Image</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)' }}>Supports JPG, PNG processed securely via edge AI</p>
              </div>

              {imagePreview && (
                <div className="preview-container" style={{ display: 'block' }}>
                  <p style={{ fontSize: '0.8rem', marginBottom: '8px', fontWeight: 700, color: 'var(--neutral-700)' }}>Selected Roster Image Preview:</p>
                  <img className="preview-image" src={imagePreview} alt="Upload preview" />
                </div>
              )}
            </div>
          )}

          {activeTab === 'sanitize' && (
            <div id="panel-sanitize">
              <h2>Roster Normalization Helper</h2>
              <p className="description">Upload problematic, broken, or weirdly formatted CSV/XLSX lists. Llama 3.1 will dynamically scan, structure, and output standard names and clean contacts.</p>

              <div className="dropzone" onClick={() => sanitizeInputRef.current?.click()}>
                <input type="file" ref={sanitizeInputRef} accept=".csv,.xlsx,.xls" onChange={handleSheetSelection} />
                <div className="dropzone-icon"><FileSpreadsheet size={24} /></div>
                <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>Select Dirty Spreadsheet</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)' }}>Supports CSV, XLSX up to 10MB</p>
              </div>
            </div>
          )}

          <div className="options-group">
            <p className="options-title">Select Download Output File Format:</p>
            <div className="format-selector">
              <label className="format-label">
                <input
                  type="radio"
                  name="output-format"
                  value="xlsx"
                  checked={outputFormat === 'xlsx'}
                  onChange={() => setOutputFormat('xlsx')}
                />
                <FileSpreadsheet size={18} style={{ color: 'var(--success)' }} /> Microsoft Excel (.xlsx)
              </label>
              <label className="format-label">
                <input
                  type="radio"
                  name="output-format"
                  value="csv"
                  checked={outputFormat === 'csv'}
                  onChange={() => setOutputFormat('csv')}
                />
                <FileText size={18} style={{ color: 'var(--primary)' }} /> Plain CSV (.csv)
              </label>
            </div>
          </div>

          <button
            className="btn"
            disabled={isSubmitDisabled}
            onClick={executeProcessorPipeline}
          >
            <Play size={18} /> {isProcessing ? 'Processing in Worker...' : 'Extract & Download Clean File'}
          </button>

          {status.message && (
            <div className={`status-message ${status.type}`} style={{ display: 'flex' }}>
              {status.message}
            </div>
          )}
        </div>

        <div className="guide-box">
          <h3><Info size={20} /> Quick Integration Guide</h3>
          <div className="guide-steps">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-text">
                <h4>Hono & Edge Harmony</h4>
                <p>This page sends the workload to the native <code>/api/companion</code> route. No extra domain setup required.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-text">
                <h4>Download Clean Roster</h4>
                <p>Choose standard .xlsx or .csv output formats. Tapping execute saves a clean copy locally to your machine.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}