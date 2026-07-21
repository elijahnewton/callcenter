import { useState } from "react";
import { useAuth, UserButton } from "@clerk/clerk-react";
import { PhoneCall, SkipForward, Send } from "lucide-react";
import { useCallQueue } from "../hooks/useCallQueue";

export function CallerDashboard() {
  const { currentContact, isLoading, fetchNextContact, submitDisposition } = useCallQueue();
  const [disposition, setDisposition] = useState("answered");
  const [notes, setNotes] = useState("");

  const handleLogAndNext = async () => {
    if (!currentContact) return;
    await submitDisposition(currentContact.id, disposition, notes);
    setNotes(""); // Clear notes for next call
    // No need to call fetchNextContact() here, the hook does it automatically after submission!
  };

  return (
    <div style={{ maxWidth: "500px", margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1>Calling Interface</h1>
        <UserButton />
      </div>

      {!currentContact && !isLoading && (
        <div style={{ textAlign: "center", padding: "4rem 0" }}>
          <p style={{ color: "#666", marginBottom: "1rem" }}>You have no contacts assigned or available.</p>
          <button onClick={fetchNextContact} style={{ padding: "0.75rem 1.5rem", background: "#f97316", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
            Check for New Contacts
          </button>
        </div>
      )}

      {isLoading && <p style={{ textAlign: "center", color: "#666" }}>Fetching next contact...</p>}

      {currentContact && (
        <div style={{ background: "white", padding: "2rem", borderRadius: "12px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid #f3f4f6" }}>
            <h2 style={{ color: "#111827" }}>
              {currentContact.first_name} {currentContact.last_name}
            </h2>
            <p style={{ color: "#6b7280", fontSize: "1.1rem", marginTop: "0.5rem" }}>
              {currentContact.phone_number}
            </p>
            
            <a 
              href={`tel:${currentContact.phone_number}`} 
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem", padding: "1rem 2rem", background: "#22c55e", color: "white", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "1.1rem" }}
            >
              <PhoneCall size={20} /> Call Now
            </a>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontWeight: "600", marginBottom: "0.5rem", color: "#374151" }}>Disposition</label>
            <select 
              value={disposition} 
              onChange={(e) => setDisposition(e.target.value)}
              style={{ width: "100%", padding: "0.75rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "1rem" }}
            >
              <option value="answered">Answered</option>
              <option value="no_answer">No Answer</option>
              <option value="voicemail">Voicemail</option>
              <option value="do_not_call">Do Not Call</option>
            </select>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontWeight: "600", marginBottom: "0.5rem", color: "#374151" }}>Notes</label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details, prayer requests, etc..."
              rows={3}
              style={{ width: "100%", padding: "0.75rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "1rem", boxSizing: "border-box" }}
            />
          </div>

          <button 
            onClick={handleLogAndNext} 
            style={{ width: "100%", padding: "0.85rem", background: "#3b82f6", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
          >
            <Send size={18} /> Submit & Get Next
          </button>
        </div>
      )}
    </div>
  );
}