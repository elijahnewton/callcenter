import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { 
  ArrowLeft, Camera, Sparkles, FileSpreadsheet, FileText, 
  Play, Info, CheckCircle, AlertCircle, Loader2, XCircle 
} from 'lucide-react';

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

// Embedded CSS styles
const AppStyles = `
  .cc-app-container {
    min-height: 100vh;
    background-color: #f8fafc;
    padding: 40px 20px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #0f172a;
    box-sizing: border-box;
  }
  .cc-app-container * { box-sizing: border-box; }
  .cc-content-wrapper { max-width: 800px; margin: 0 auto; }
  
  /* Back Button */
  .cc-back-button {
    display: inline-flex; align-items: center; gap: 8px;
    background: transparent; border: none; color: #64748b;
    font-weight: 600; cursor: pointer; padding: 8px 12px;
    border-radius: 8px; transition: all 0.2s; margin-bottom: 24px;
  }
  .cc-back-button:hover { background-color: #e2e8f0; color: #0f172a; }
  
  /* Header */
  .cc-header { margin-bottom: 32px; }
  .cc-header h1 {
    font-size: 1.875rem; font-weight: 800; letter-spacing: -0.025em;
    margin: 0 0 8px 0;
  }
  .cc-header p { font-size: 0.95rem; color: #64748b; margin: 0; line-height: 1.5; }
  
  /* Configuration Bar */
  .cc-config-bar {
    display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 24px;
    background: #ffffff; padding: 16px 24px; border-radius: 12px;
    border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }
  .cc-config-group { display: flex; flex-direction: column; gap: 8px; }
  .cc-config-label {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    color: #64748b; letter-spacing: 0.05em;
  }
  .cc-segmented-control {
    display: inline-flex; background-color: #f1f5f9; padding: 4px;
    border-radius: 8px; gap: 4px;
  }
  .cc-segment {
    display: flex; align-items: center; gap: 6px; background: transparent;
    border: none; padding: 6px 16px; font-size: 0.85rem; font-weight: 600;
    color: #64748b; border-radius: 6px; cursor: pointer; transition: all 0.2s;
  }
  .cc-segment.active {
    background: #ffffff; color: #3b82f6;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .cc-segment:not(.active):hover { color: #0f172a; }
  
  /* Main Card */
  .cc-main-card {
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08); overflow: hidden;
  }
  .cc-tabs {
    display: flex; border-bottom: 1px solid #e2e8f0; background-color: #f8fafc;
  }
  .cc-tab {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 16px; background: transparent; border: none; font-size: 0.95rem;
    font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s;
    border-bottom: 2px solid transparent;
  }
  .cc-tab.active { color: #3b82f6; background: #ffffff; border-bottom-color: #3b82f6; }
  .cc-tab:not(.active):hover { background-color: #e2e8f0; }
  
  /* Panel Content */
  .cc-panel { padding: 32px; }
  .cc-panel-content { display: flex; flex-direction: column; gap: 24px; }
  .cc-panel-header h2 { margin: 0 0 8px 0; font-size: 1.25rem; font-weight: 700; }
  .cc-panel-header p { margin: 0; color: #64748b; font-size: 0.9rem; line-height: 1.5; }
  
  /* Dropzone */
  .cc-dropzone {
    border: 2px dashed #cbd5e1; border-radius: 12px; padding: 40px 20px;
    text-align: center; cursor: pointer; transition: all 0.2s; background-color: #f8fafc;
  }
  .cc-dropzone:hover { border-color: #3b82f6; background-color: #eff6ff; }
  .cc-dropzone-icon { color: #64748b; margin-bottom: 12px; display: flex; justify-content: center; }
  .cc-dropzone-title { font-weight: 700; font-size: 1rem; margin: 0 0 4px 0; color: #0f172a; }
  .cc-dropzone-subtitle { font-size: 0.85rem; color: #64748b; margin: 0; }
  .cc-hidden-input { display: none; }
  
  /* Previews & Chips */
  .cc-preview-container { display: flex; flex-direction: column; gap: 8px; }
  .cc-preview-label { font-size: 0.8rem; font-weight: 700; color: #64748b; margin: 0; }
  .cc-preview-image {
    max-width: 100%; max-height: 300px; border-radius: 8px;
    border: 1px solid #e2e8f0; object-fit: contain;
  }
  .cc-file-chip {
    display: inline-flex; align-items: center; gap: 8px; background: #eff6ff;
    color: #3b82f6; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem;
    font-weight: 600; align-self: flex-start;
  }
  
  /* Action Area */
  .cc-action-area {
    padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0;
    display: flex; flex-direction: column; gap: 16px; align-items: stretch;
  }
  .cc-submit-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
    padding: 14px 24px; background: #3b82f6; color: #ffffff; border: none;
    border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer;
    transition: background 0.2s;
  }
  .cc-submit-btn:hover:not(:disabled) { background: #2563eb; }
  .cc-submit-btn:disabled { background: #94a3b8; cursor: not-allowed; }
  
  /* Status Messages */
  .cc-status-message {
    display: flex; align-items: center; gap: 8px; padding: 12px 16px;
    border-radius: 8px; font-size: 0.9rem; font-weight: 500;
  }
  .cc-status-message.info { background: #eff6ff; color: #6366f1; }
  .cc-status-message.success { background: #ecfdf5; color: #10b981; }
  .cc-status-message.error { background: #fef2f2; color: #ef4444; }
  
  /* Spin Animation */
  .cc-spin { animation: cc-spin 1s linear infinite; }
  @keyframes cc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  
  /* Guide Card */
  .cc-guide-card {
    margin-top: 32px; background: #ffffff; border: 1px solid #e2e8f0;
    border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }
  .cc-guide-card h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 24px 0; font-size: 1.1rem; }
  .cc-guide-steps { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 768px) {
    .cc-guide-steps { grid-template-columns: 1fr; }
    .cc-config-bar { flex-direction: column; gap: 16px; }
  }
  .cc-step { display: flex; gap: 12px; }
  .cc-step-num {
    flex-shrink: 0; width: 24px; height: 24px; background: #3b82f6; color: #ffffff;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 0.8rem; font-weight: 700;
  }
  .cc-step-text h4 { margin: 0 0 4px 0; font-size: 0.95rem; }
  .cc-step-text p { margin: 0; font-size: 0.85rem; color: #64748b; line-height: 1.4; }
  .cc-step-text code {
    background: #f1f5f9; padding: 2px 6px; border-radius: 4px;
    font-size: 0.8rem; font-family: monospace;
  }
`;

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
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const switchTab = (tab: 'ocr' | 'sanitize') => {
    abortControllerRef.current?.abort();
    setActiveTab(tab);
    setSelectedFile(null);
    setImageBase64(null);
    setImagePreview(null);
    setStatus({ message: '', type: '' });
  };

  const handleImageSelection = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setStatus({ message: 'Invalid file type. Please upload a JPG, PNG, or WebP image.', type: 'error' });
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setStatus({ message: 'Image is too large. Maximum size is 5 MB.', type: 'error' });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);
      setImageBase64(result);
      setStatus({ message: 'Image loaded successfully. Ready to process.', type: 'info' });
    };
    reader.onerror = () => {
      setStatus({ message: 'Failed to read the image file.', type: 'error' });
    };
    reader.readAsDataURL(file);
  };

  const handleSheetSelection = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    setStatus({ message: `${file.name} loaded. Ready to normalize.`, type: 'info' });
  };

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

  const executeProcessorPipeline = async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setIsProcessing(true);
    setStatus({ message: 'Processing data via Cloudflare Workers AI...', type: 'info' });

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
          signal: controller.signal,
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
      setStatus({ message: `Success! Processed ${parsedResultJson.length} records.`, type: 'success' });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        setStatus({ message: 'Request was cancelled.', type: 'info' });
      } else {
        console.error(error);
        setStatus({ message: `Operation Failed: ${error.message}`, type: 'error' });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsProcessing(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const isSubmitDisabled = isProcessing || (activeTab === 'ocr' && !imageBase64) || (activeTab === 'sanitize' && !selectedFile);

  const StatusIcon = () => {
    if (isProcessing) return <Loader2 className="cc-spin" size={18} />;
    if (status.type === 'success') return <CheckCircle size={18} />;
    if (status.type === 'error') return <XCircle size={18} />;
    return <Info size={18} />;
  };

  return (
    <div className="cc-app-container">
      <style>{AppStyles}</style>
      
      <div className="cc-content-wrapper">
        <button onClick={onBack} className="cc-back-button">
          <ArrowLeft size={18} /> Return to Call Center
        </button>

        <header className="cc-header">
          <h1>Campaign Data Companion</h1>
          <p>Convert handwritten images or format unstructured spreadsheets into clean, actionable data using Cloudflare Workers AI.</p>
        </header>

        {/* Configuration Section */}
        <div className="cc-config-bar">
          <div className="cc-config-group">
            <label className="cc-config-label">Campaign Type</label>
            <div className="cc-segmented-control">
              {(['sms', 'email', 'call'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`cc-segment ${channel === mode ? 'active' : ''}`}
                  onClick={() => setChannel(mode)}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="cc-config-group">
            <label className="cc-config-label">Output Format</label>
            <div className="cc-segmented-control">
              <button 
                className={`cc-segment ${outputFormat === 'xlsx' ? 'active' : ''}`}
                onClick={() => setOutputFormat('xlsx')}
              >
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button 
                className={`cc-segment ${outputFormat === 'csv' ? 'active' : ''}`}
                onClick={() => setOutputFormat('csv')}
              >
                <FileText size={16} /> CSV
              </button>
            </div>
          </div>
        </div>

        {/* Main Action Card */}
        <div className="cc-main-card">
          <div className="cc-tabs">
            <button
              className={`cc-tab ${activeTab === 'ocr' ? 'active' : ''}`}
              onClick={() => switchTab('ocr')}
            >
              <Camera size={20} /> Vision OCR Extractor
            </button>
            <button
              className={`cc-tab ${activeTab === 'sanitize' ? 'active' : ''}`}
              onClick={() => switchTab('sanitize')}
            >
              <Sparkles size={20} /> Smart Spreadsheet Sanitizer
            </button>
          </div>

          <div className="cc-panel">
            {activeTab === 'ocr' ? (
              <div className="cc-panel-content">
                <div className="cc-panel-header">
                  <h2>Handwritten List Extractor</h2>
                  <p>Snap a sharp photo of pen-and-paper sign-up lists. The Edge Vision model will isolate text and normalize fields.</p>
                </div>
                <div className="cc-dropzone" onClick={() => ocrInputRef.current?.click()}>
                  <input type="file" ref={ocrInputRef} accept="image/*" onChange={handleImageSelection} className="cc-hidden-input" />
                  <div className="cc-dropzone-icon"><Camera size={32} /></div>
                  <p className="cc-dropzone-title">Capture Photo or Select Image</p>
                  <p className="cc-dropzone-subtitle">Supports JPG, PNG up to 5MB</p>
                </div>

                {imagePreview && (
                  <div className="cc-preview-container">
                    <p className="cc-preview-label">Image Preview:</p>
                    <img className="cc-preview-image" src={imagePreview} alt="Upload preview" />
                  </div>
                )}
              </div>
            ) : (
              <div className="cc-panel-content">
                <div className="cc-panel-header">
                  <h2>Roster Normalization Helper</h2>
                  <p>Upload problematic, broken, or weirdly formatted CSV/XLSX lists. AI will scan, structure, and output clean contacts.</p>
                </div>
                <div className="cc-dropzone" onClick={() => sanitizeInputRef.current?.click()}>
                  <input type="file" ref={sanitizeInputRef} accept=".csv,.xlsx,.xls" onChange={handleSheetSelection} className="cc-hidden-input" />
                  <div className="cc-dropzone-icon"><FileSpreadsheet size={32} /></div>
                  <p className="cc-dropzone-title">Select Unstructured Spreadsheet</p>
                  <p className="cc-dropzone-subtitle">Supports CSV, XLSX up to 10MB</p>
                </div>

                {selectedFile && (
                  <div className="cc-file-chip">
                    <FileSpreadsheet size={16} />
                    <span>{selectedFile.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="cc-action-area">
            <button
              className="cc-submit-btn"
              disabled={isSubmitDisabled}
              onClick={executeProcessorPipeline}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="cc-spin" size={20} /> Processing via Worker...
                </>
              ) : (
                <>
                  <Play size={20} /> Extract & Download Clean File
                </>
              )}
            </button>

            {status.message && (
              <div className={`cc-status-message ${status.type}`}>
                <StatusIcon />
                <span>{status.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Guide Section */}
        <div className="cc-guide-card">
          <h3><Info size={20} /> How it works</h3>
          <div className="cc-guide-steps">
            <div className="cc-step">
              <div className="cc-step-num">1</div>
              <div className="cc-step-text">
                <h4>Local Edge Processing</h4>
                <p>Data is sent to the native <code>/api/companion</code> route. No external domains or third-party APIs are called.</p>
              </div>
            </div>
            <div className="cc-step">
              <div className="cc-step-num">2</div>
              <div className="cc-step-text">
                <h4>Instant Local Export</h4>
                <p>Once the Worker returns structured JSON, the browser instantly compiles and downloads your requested format.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}