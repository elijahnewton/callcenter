import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { Smartphone, Menu, Sun, Moon } from 'lucide-react';
import { db } from './db/database';
import type { CampaignRecord } from './types';
import { SetupScreen } from './components/SetupScreen';
import { UploadZone } from './components/UploadZone';
import { Teleprompter } from './components/Teleprompter';
import { TrackingPanel } from './components/TrackingPanel';
import { SideMenu } from './components/SideMenu';
import { ReportPage } from './components/ReportPage';

const DEFAULT_SCRIPT = 'Hello [Name], my name is [CallerName] calling from "[BranchName]". I am calling to know how you\'re doing and to invite you for service.';

type AlertType = 'success' | 'error' | 'info';
type ThemeType = 'dark' | 'light';

declare global {
  interface WindowEventMap { beforeinstallprompt: BeforeInstallPromptEvent; }
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }
}

function getSessionValue<T>(entries: Array<{ key: string; value: unknown }> | undefined, key: string, fallback: T): T {
  const entry = entries?.find((item) => item.key === key);
  return entry ? (entry.value as T) : fallback;
}

export default function App() {
  const records = useLiveQuery(() => db.records.orderBy('id').toArray(), []);
  const sessionEntries = useLiveQuery(() => db.session.toArray(), []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [callerName, setCallerName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [setupComplete, setSetupComplete] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  
  // --- THEME STATE ---
  const [theme, setTheme] = useState<ThemeType>(() => {
    return (localStorage.getItem('app-theme') as ThemeType) || 'dark';
  });

  const hydratedRef = useRef(false);

  // Apply theme to HTML element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    if (hydratedRef.current || sessionEntries === undefined) return;
    setCurrentIndex(getSessionValue<number>(sessionEntries, 'currentIndex', 0));
    setScript(getSessionValue<string>(sessionEntries, 'script', DEFAULT_SCRIPT));
    setCallerName(getSessionValue<string>(sessionEntries, 'callerName', ''));
    setBranchName(getSessionValue<string>(sessionEntries, 'branchName', ''));
    setSetupComplete(getSessionValue<boolean>(sessionEntries, 'setupComplete', false));
    hydratedRef.current = true;
  }, [sessionEntries]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void db.session.bulkPut([
      { key: 'currentIndex', value: currentIndex },
      { key: 'script', value: script },
      { key: 'callerName', value: callerName },
      { key: 'branchName', value: branchName },
      { key: 'setupComplete', value: setupComplete },
    ]);
  }, [branchName, callerName, currentIndex, script, setupComplete]);

  useEffect(() => {
    const beforeInstallHandler = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    return () => window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
  }, []);

  useEffect(() => {
    if (!records || records.length === 0) return;
    if (currentIndex >= records.length) setCurrentIndex(records.length - 1);
  }, [currentIndex, records]);

  const activeRecords = records ?? [];
  const currentRecord = activeRecords[currentIndex];

  const progress = useMemo(() => {
    if (activeRecords.length === 0) return 0;
    return ((currentIndex + 1) / activeRecords.length) * 100;
  }, [activeRecords.length, currentIndex]);

  const showAlert = (message: string, type: AlertType = 'info') => {
    setAlert({ message, type });
    window.setTimeout(() => setAlert(null), 3000);
  };

  const handleSetup = () => {
    if (!callerName.trim() || !branchName.trim()) { showAlert('Please fill in all fields.', 'error'); return; }
    setCallerName(callerName.trim());
    setBranchName(branchName.trim());
    setSetupComplete(true);
    showAlert('Setup complete. Ready to make calls.', 'success');
  };

  const handleChangeUser = async () => {
    setCallerName(''); setBranchName(''); setSetupComplete(false);
    await db.session.bulkPut([{ key: 'callerName', value: '' }, { key: 'branchName', value: '' }, { key: 'setupComplete', value: false }]);
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choiceResult = await installPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') { setInstallPrompt(null); setShowInstallBanner(false); }
  };

  const updateRecord = async (field: 'status' | 'customResponse' | 'notes', value: string) => {
    if (!currentRecord) return;
    await db.records.update(currentRecord.id, { [field]: value });
  };

  const handleUpdateContact = async (name: string, phone: string) => {
    if (!currentRecord) return;
    await db.records.update(currentRecord.id, { name, phone });
    showAlert('Contact details updated.', 'success');
  };

  const goNext = () => { if (currentIndex < activeRecords.length - 1) setCurrentIndex((prev) => prev + 1); };
  const goPrevious = () => { if (currentIndex > 0) setCurrentIndex((prev) => prev - 1); };

  const exportData = async () => {
    const dbRecords = await db.records.toArray();
    if (dbRecords.length === 0) { showAlert('No records to export.', 'error'); return; }
    const statusLabels: Record<string, string> = { yes: 'Yes', no: 'No', notpicking: 'Not Picking', phoneoff: 'Phone Off', changedaddr: 'Changed Address', other: 'Other' };
    const exportRecords = dbRecords.map((r) => ({ Name: r.name, Phone: r.phone, Status: statusLabels[r.status] || r.status || 'Not Called', 'Custom Response': r.status === 'other' ? r.customResponse : '', Notes: r.notes }));
    const worksheet = XLSX.utils.json_to_sheet(exportRecords);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Campaign Results');
    worksheet['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 30 }, { wch: 50 }];
    XLSX.writeFile(workbook, `campaign-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    showAlert('Report downloaded successfully.', 'success');
  };

  const handleRecordsParsed = async (parsedRecords: CampaignRecord[]) => {
    await db.transaction('rw', db.records, db.session, async () => {
      const maxId = await db.records.orderBy('id').last().then((r) => r?.id ?? 0);
      const newRecords = parsedRecords.map((r, i) => ({ ...r, id: maxId + i + 1, congregantId: maxId + i + 1 }));
      await db.records.bulkAdd(newRecords);
      const newIndex = maxId === 0 ? 0 : maxId;
      setCurrentIndex(newIndex);
      await db.session.put({ key: 'currentIndex', value: newIndex });
    });
    showAlert(`Appended ${parsedRecords.length} records to list.`, 'success');
  };

  const handleSelectContact = (index: number) => { setCurrentIndex(index); setShowMenu(false); if (showReport) setShowReport(false); };
  const handleClearMemory = async () => { await db.records.clear(); setCurrentIndex(0); await db.session.put({ key: 'currentIndex', value: 0 }); setShowMenu(false); setShowReport(false); showAlert('Memory cleared.', 'info'); };

  if (!setupComplete) return <SetupScreen callerName={callerName} branchName={branchName} onCallerNameChange={setCallerName} onBranchNameChange={setBranchName} onSubmit={handleSetup} />;

  const AppHeader = () => (
    <header className="header">
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="hamburger-btn header-hamburger" onClick={() => setShowMenu(true)} style={{ position: 'relative' }}>
          <Menu size={20} />
          {activeRecords.length > 0 && <span className="menu-badge">{activeRecords.length}</span>}
        </button>
        <div className="brand-logo">
          <span className="brand-main">Manifest</span>
          <span className="brand-sub">fellowship</span>
        </div>
        
        <div className="header-actions">
          <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );

  if (showReport) {
    return (
      <>
        <AppHeader />
        <div className="container">
          {alert && <div className={`alert ${alert.type}`}>{alert.message}</div>}
          <ReportPage records={activeRecords} onBack={() => setShowReport(false)} onDownloadReport={exportData} />
        </div>
        <SideMenu isOpen={showMenu} onClose={() => setShowMenu(false)} records={activeRecords} onSelectContact={handleSelectContact} onClearMemory={handleClearMemory} onShowReport={() => setShowMenu(false)} currentRecordIndex={currentIndex} />
      </>
    );
  }

  return (
    <div>
      <AppHeader />
      <div className="container">
        {showInstallBanner && (
          <div className="install-banner">
            <p><Smartphone size={20} color="var(--primary)" /> Install this app for fully offline calling sessions.</p>
            <button type="button" className="install-btn" onClick={handleInstall}>Install App</button>
          </div>
        )}
        {alert && <div className={`alert ${alert.type}`}>{alert.message}</div>}
        <div className="user-info">
          <strong>Caller:</strong> {callerName}<br />
          <strong>Branch:</strong> {branchName}
          <button type="button" className="change-user-btn" onClick={handleChangeUser}>Change</button>
        </div>

        {activeRecords.length === 0 ? (
          <UploadZone onRecordsParsed={handleRecordsParsed} onAlert={showAlert} />
        ) : (
          <>
            <div className="progress-container">
              <div className="progress-info"><span>Contact {currentIndex + 1} of {activeRecords.length}</span><span>{Math.round(progress)}% Complete</span></div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            </div>
            {currentRecord && (
              <div className="main-layout">
                <Teleprompter script={script} currentRecord={currentRecord} callerName={callerName} branchName={branchName} onUpdateContact={handleUpdateContact} />
                <TrackingPanel record={currentRecord} currentIndex={currentIndex} totalRecords={activeRecords.length} onUpdateRecord={updateRecord} onPrevious={goPrevious} onNext={goNext} onComplete={() => setShowReport(true)} onDownloadReport={exportData} />
              </div>
            )}
            <details className="load-more-section">
              <summary>+ Load another list (appends to current contacts)</summary>
              <div style={{ marginTop: '0.75rem' }}><UploadZone onRecordsParsed={handleRecordsParsed} onAlert={showAlert} /></div>
            </details>
          </>
        )}
      </div>
      <SideMenu isOpen={showMenu} onClose={() => setShowMenu(false)} records={activeRecords} onSelectContact={handleSelectContact} onClearMemory={handleClearMemory} onShowReport={() => { setShowMenu(false); if (activeRecords.length > 0) setShowReport(true); }} currentRecordIndex={currentIndex} />
    </div>
  );
}