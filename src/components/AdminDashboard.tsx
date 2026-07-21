import { useState, useEffect, useRef } from "react";
import { useAuth, OrganizationSwitcher } from "@clerk/clerk-react";
import { Upload, Users, Radio, Download } from "lucide-react";

export function AdminDashboard() {
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState({ queue: 0, completed: 0 });
  const [distributing, setDistributing] = useState(false);

  // WebSocket for real-time stats
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/dashboard/ws`;
    
    const getTokenAndConnect = async () => {
      const token = await getToken();
      const ws = new WebSocket(`${wsUrl}?token=${token}`);
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event === "init") {
          setStats(prev => ({ ...prev, queue: msg.data.queueSize }));
        } else if (msg.event === "call_completed") {
          setStats(prev => ({ queue: prev.queue - 1, completed: prev.completed + 1 }));
        }
      };
      return ws;
    };

    const wsPromise = getTokenAndConnect();
    return () => { wsPromise.then(ws => ws.close()); };
  }, [getToken]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = await getToken();
      const res = await fetch("/api/contacts/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      alert(data.success ? `Imported ${data.imported} contacts!` : data.error);
    } catch (err) {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDistributeEvenly = async () => {
    setDistributing(true);
    // In a real app, you'd fetch actual caller IDs from your DB here.
    // For demonstration, assuming you have these user IDs in your Clerk Org:
    const mockCallerIds = ["user_caller_1", "user_caller_2"]; 
    
    try {
      const token = await getToken();
      const res = await fetch("/api/contacts/distribute-evenly", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ caller_ids: mockCallerIds }),
      });
      const data = await res.json();
      alert(`Distributed ${data.distributed} contacts evenly!`);
    } catch (err) {
      alert("Distribution failed");
    } finally {
      setDistributing(false);
    }
  };

  const handleExport = async () => {
    const token = await getToken();
    window.open(`/api/reports/export?token=${token}`, "_blank");
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}>
        <h1>Admin Panel</h1>
        <OrganizationSwitcher />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ padding: "1.5rem", background: "#f9fafb", borderRadius: "8px", textAlign: "center" }}>
          <Radio size={24} color="#f97316" />
          <h2 style={{ margin: "0.5rem 0" }}>{stats.queue}</h2>
          <p style={{ color: "#666" }}>Available in Queue</p>
        </div>
        <div style={{ padding: "1.5rem", background: "#f9fafb", borderRadius: "8px", textAlign: "center" }}>
          <Users size={24} color="#22c55e" />
          <h2 style={{ margin: "0.5rem 0" }}>{stats.completed}</h2>
          <p style={{ color: "#666" }}>Calls Completed</p>
        </div>
      </div>

      <div style={{ background: "white", padding: "2rem", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "1rem" }}>
        <h3>1. Upload Contact List</h3>
        <p style={{ color: "#666", fontSize: "0.9rem", margin: "0.5rem 0" }}>
          Upload a .csv or .xlsx file. All contacts go into the Shared Pool.
        </p>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={handleUpload} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ padding: "0.5rem 1rem", background: "#f97316", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
          {uploading ? "Processing..." : <><Upload size={16} style={{ verticalAlign: "middle", marginRight: "5px" }} /> Upload File</>}
        </button>
      </div>

      <div style={{ background: "white", padding: "2rem", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "1rem" }}>
        <h3>2. Distribution Strategy</h3>
        <p style={{ color: "#666", fontSize: "0.9rem", margin: "0.5rem 0 1rem" }}>
          Leave as Shared Pool, or Auto-Distribute evenly to your callers.
        </p>
        <button onClick={handleDistributeEvenly} disabled={distributing} style={{ padding: "0.5rem 1rem", background: "#3b82f6", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
          {distributing ? "Distributing..." : <><Users size={16} style={{ verticalAlign: "middle", marginRight: "5px" }} /> Distribute Evenly</>}
        </button>
      </div>

      <button onClick={handleExport} style={{ width: "100%", padding: "0.75rem", background: "#22c55e", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
        <Download size={18} style={{ verticalAlign: "middle", marginRight: "5px" }} /> Export Full Report (.xlsx)
      </button>
    </div>
  );
}