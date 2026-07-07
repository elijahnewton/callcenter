import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { Download, Smartphone } from 'lucide-react';
import { db } from './db/database';
import type { CampaignRecord } from './types';
import { SetupScreen } from './components/SetupScreen';
import { UploadZone } from './components/UploadZone';
import { Teleprompter } from './components/Teleprompter';
import { TrackingPanel } from './components/TrackingPanel';

const DEFAULT_SCRIPT =
  'Hello [Name], my name is [CallerName] calling from "[BranchName]". I am calling to know how you\'re doing and to invite you for service.';

type AlertType = 'success' | 'error' | 'info';

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }

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

  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current || sessionEntries === undefined) {
      return;
    }

    setCurrentIndex(getSessionValue<number>(sessionEntries, 'currentIndex', 0));
    setScript(getSessionValue<string>(sessionEntries, 'script', DEFAULT_SCRIPT));
    setCallerName(getSessionValue<string>(sessionEntries, 'callerName', ''));
    setBranchName(getSessionValue<string>(sessionEntries, 'branchName', ''));
    setSetupComplete(getSessionValue<boolean>(sessionEntries, 'setupComplete', false));
    hydratedRef.current = true;
  }, [sessionEntries]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

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
    if (!records || records.length === 0) {
      return;
    }
    if (currentIndex >= records.length) {
      setCurrentIndex(records.length - 1);
    }
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
    if (!callerName.trim() || !branchName.trim()) {
      showAlert('Please fill in all fields.', 'error');
      return;
    }

    setCallerName(callerName.trim());
    setBranchName(branchName.trim());
    setSetupComplete(true);
    showAlert('Setup complete. Ready to make calls.', 'success');
  };

  const handleChangeUser = async () => {
    setCallerName('');
    setBranchName('');
    setSetupComplete(false);
    await db.session.bulkPut([
      { key: 'callerName', value: '' },
      { key: 'branchName', value: '' },
      { key: 'setupComplete', value: false },
    ]);
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    const choiceResult = await installPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      setInstallPrompt(null);
      setShowInstallBanner(false);
    }
  };

  const updateRecord = async (field: 'status' | 'customResponse' | 'notes', value: string) => {
    if (!currentRecord) return;
    await db.records.update(currentRecord.id, { [field]: value });
  };

  const goNext = () => {
    if (currentIndex < activeRecords.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const goPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const exportData = async (isCompletion = false) => {
    const dbRecords = await db.records.toArray();
    if (dbRecords.length === 0) {
      showAlert('No records to export.', 'error');
      return;
    }

    const exportRecords = dbRecords.map((record) => ({
      name: record.name,
      phone: record.phone,
      status: record.status,
      customResponse: record.customResponse,
      notes: record.notes,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRecords);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = isCompletion ? `Completed_${timestamp}.xlsx` : `In_Progress_${timestamp}.xlsx`;
    XLSX.writeFile(workbook, filename);

    showAlert(`Exported as ${filename}.`, 'success');

    if (isCompletion) {
      await db.records.clear();
      setCurrentIndex(0);
      showAlert('Campaign finished. Database cleared for a new upload.', 'success');
    }
  };

  const handleRecordsParsed = async (parsedRecords: CampaignRecord[]) => {
    await db.transaction('rw', db.records, db.session, async () => {
      await db.records.clear();
      await db.records.bulkAdd(parsedRecords);
      await db.session.put({ key: 'currentIndex', value: 0 });
    });
    setCurrentIndex(0);
  };

  if (!setupComplete) {
    return (
      <SetupScreen
        callerName={callerName}
        branchName={branchName}
        onCallerNameChange={setCallerName}
        onBranchNameChange={setBranchName}
        onSubmit={handleSetup}
      />
    );
  }

  return (
    <div>
      <header className="header">
        <div className="container">
          <h1>Church Call Center Assistant</h1>
          <p>{activeRecords.length === 0 ? 'Offline-First Campaign Manager' : `${callerName} • ${branchName}`}</p>
        </div>
      </header>

      <div className="container">
        {showInstallBanner && (
          <div className="install-banner">
            <p>
              <Smartphone size={18} /> Install this app for fully offline calling sessions.
            </p>
            <button type="button" className="install-btn" onClick={handleInstall}>
              Install App
            </button>
          </div>
        )}

        {alert && <div className={`alert ${alert.type}`}>{alert.message}</div>}

        <div className="user-info">
          <strong>Caller:</strong> {callerName}
          <br />
          <strong>Branch:</strong> {branchName}
          <button type="button" className="change-user-btn" onClick={handleChangeUser}>
            Change
          </button>
        </div>

        {activeRecords.length === 0 ? (
          <UploadZone onRecordsParsed={handleRecordsParsed} onAlert={showAlert} />
        ) : (
          <>
            <div className="progress-container">
              <div className="progress-info">
                <span>
                  Contact {currentIndex + 1} of {activeRecords.length}
                </span>
                <span>{Math.round(progress)}% Complete</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>

            {currentRecord && (
              <div className="main-layout">
                <Teleprompter
                  script={script}
                  currentRecord={currentRecord}
                  callerName={callerName}
                  branchName={branchName}
                />
                <TrackingPanel
                  record={currentRecord}
                  currentIndex={currentIndex}
                  totalRecords={activeRecords.length}
                  onUpdateRecord={updateRecord}
                  onPrevious={goPrevious}
                  onNext={goNext}
                  onComplete={() => exportData(true)}
                />
              </div>
            )}

            <button type="button" className="fab" onClick={() => exportData(false)} title="Save backup">
              <Download size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
