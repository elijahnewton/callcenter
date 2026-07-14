import React, { useState, useRef, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { ArrowLeft, Camera, Sparkles, FileSpreadsheet, FileText, Play, Info } from 'lucide-react';
import './CampaignCompanion.css'; // Make sure to save the CSS file below

// Replace this with the actual URL/path to your local AI handler endpoint
const LOCAL_API_ENDPOINT = '/api/companion-utility'; 

export default function CampaignCompanion() {
    const [activeTab, setActiveTab] = useState<'ocr' | 'sanitize'>('ocr');
    
    // File & Data States
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [outputFormat, setOutputFormat] = useState<'xlsx' | 'csv'>('xlsx');
    
    // UI States
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' | '' }>({ message: '', type: '' });

    // Refs for hidden file inputs
    const ocrInputRef = useRef<HTMLInputElement>(null);
    const sanitizeInputRef = useRef<HTMLInputElement>(null);

    const switchTab = (tab: 'ocr' | 'sanitize') => {
        setActiveTab(tab);
        setSelectedFile(null);
        setImageBase64(null);
        setImagePreview(null);
        setStatus({ message: '', type: '' });
    };

    const handleImageSelection = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setImagePreview(result);
            setImageBase64(result.split(',')[1]); // Extract base64 part
            setStatus({ message: 'Image parsed successfully. Ready to run AI OCR pipeline.', type: 'info' });
        };
        reader.readAsDataURL(file);
    };

    const handleSheetSelection = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setStatus({ message: `Loaded ${file.name}. Ready to normalize roster properties.`, type: 'info' });
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
        setIsProcessing(true);
        setStatus({ message: 'Local AI is currently processing your data. This may take a moment...', type: 'info' });

        try {
            let parsedResultJson: any[] = [];

            if (activeTab === 'ocr') {
                if (!imageBase64) throw new Error("No image selected");
                
                const response = await fetch(LOCAL_API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'ocr',
                        image: imageBase64
                    })
                });

                if (!response.ok) throw new Error('OCR transaction failed.');
                const result = await response.json();
                parsedResultJson = result.data;

            } else {
                if (!selectedFile) throw new Error("No file selected");

                // Pre-parse the dirty sheet to a raw text format
                const buffer = await selectedFile.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawRows = XLSX.utils.sheet_to_json(worksheet);

                const response = await fetch(LOCAL_API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'sanitize',
                        data: rawRows
                    })
                });

                if (!response.ok) throw new Error('Normalization request rejected.');
                const result = await response.json();
                parsedResultJson = result.data;
            }

            if (!parsedResultJson || parsedResultJson.length === 0) {
                throw new Error('AI was unable to extract any structured records from the input.');
            }

            triggerLocalDownload(parsedResultJson);
            setStatus({ message: `Success! Extracted ${parsedResultJson.length} normalized records.`, type: 'success' });

        } catch (error: any) {
            console.error(error);
            setStatus({ message: `Operation Failed: ${error.message}. Please try again.`, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const isSubmitDisabled = isProcessing || (activeTab === 'ocr' && !imageBase64) || (activeTab === 'sanitize' && !selectedFile);

    return (
        <div className="campaign-body">
            <div className="container">
                <a href="/" className="back-link">
                    <ArrowLeft size={18} /> Return to Local Call Center
                </a>

                <div className="header">
                    <h1>Campaign Data Companion</h1>
                    <p>Convert handwriting photos or format problematic rosters using local AI</p>
                </div>

                <div className="tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'ocr' ? 'active' : ''}`} 
                        onClick={() => switchTab('ocr')}
                    >
                        <Camera size={18} /> Image OCR Engine
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'sanitize' ? 'active' : ''}`} 
                        onClick={() => switchTab('sanitize')}
                    >
                        <Sparkles size={18} /> Clean & Normalize Sheet
                    </button>
                </div>

                <div className="card">
                    {/* PANEL A: HANDWRITTEN PHOTO EXTRACTION */}
                    {activeTab === 'ocr' && (
                        <div id="panel-ocr">
                            <h2>Handwritten List Extractor</h2>
                            <p className="description">Snap a sharp photo of pen-and-paper sign-up lists, cell group cards, or rosters. The AI reads names and phone numbers directly from the picture and compiles them.</p>

                            <div className="dropzone" onClick={() => ocrInputRef.current?.click()}>
                                <input type="file" ref={ocrInputRef} accept="image/*" onChange={handleImageSelection} />
                                <div className="dropzone-icon"><Camera size={24} /></div>
                                <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>Capture Photo or Select Image</p>
                                <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)' }}>Supports JPG, PNG formats up to 5MB</p>
                            </div>

                            {imagePreview && (
                                <div className="preview-container" style={{ display: 'block' }}>
                                    <p style={{ fontSize: '0.8rem', marginBottom: '8px', fontWeight: 700, color: 'var(--neutral-700)' }}>Selected Roster Image:</p>
                                    <img className="preview-image" src={imagePreview} alt="Upload preview" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* PANEL B: SHEET CLEANER & NORMALIZER */}
                    {activeTab === 'sanitize' && (
                        <div id="panel-sanitize">
                            <h2>Roster Normalization Helper</h2>
                            <p className="description">Upload problematic, broken, or weirdly formatted CSV/XLSX lists. The AI identifies conjoined names, isolates contact telephone numbers, and formats properties cleanly.</p>

                            <div className="dropzone" onClick={() => sanitizeInputRef.current?.click()}>
                                <input type="file" ref={sanitizeInputRef} accept=".csv,.xlsx,.xls" onChange={handleSheetSelection} />
                                <div className="dropzone-icon"><FileSpreadsheet size={24} /></div>
                                <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>Select Dirty Spreadsheet</p>
                                <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)' }}>Supports CSV, XLSX up to 10MB</p>
                            </div>
                        </div>
                    )}

                    {/* EXPORT COMPILATION CONFIGURATIONS */}
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

                    {/* SUBMIT & TRIGGER ACTIONS */}
                    <button 
                        className="btn" 
                        disabled={isSubmitDisabled} 
                        onClick={executeProcessorPipeline}
                    >
                        <Play size={18} /> {isProcessing ? 'Processing...' : 'Analyze & Export Clean File'}
                    </button>

                    {/* PROCESS FEEDBACK ALERTS */}
                    {status.message && (
                        <div className={`status-message ${status.type}`} style={{ display: 'flex' }}>
                            {status.message}
                        </div>
                    )}
                </div>

                {/* OPERATIONAL USER GUIDE */}
                <div className="guide-box">
                    <h3><Info size={20} /> Quick Integration Guide</h3>
                    <div className="guide-steps">
                        <div className="step">
                            <div className="step-num">1</div>
                            <div className="step-text">
                                <h4>Convert Roster Offline</h4>
                                <p>Upload handwritten lists or messy formats. The AI processes inputs and automatically creates structural records matching 'Name' and 'Phone'.</p>
                            </div>
                        </div>
                        <div className="step">
                            <div className="step-num">2</div>
                            <div className="step-text">
                                <h4>Download Your Clean File</h4>
                                <p>Choose either standard .xlsx or .csv output formats. Tapping execute starts an automatic download process.</p>
                            </div>
                        </div>
                        <div className="step">
                            <div className="step-num">3</div>
                            <div className="step-text">
                                <h4>Import directly to Call Center workspace</h4>
                                <p>Return to the main local browser application screen, drop in the compiled export file, and start follow-up calls immediately.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}