import { useEffect, useState, useRef } from 'react';

interface Contact {
  id: string;
  name: string;
  phone: string;
  status: 'available' | 'locked' | 'completed';
  locked_by: string | null;
  notes: string;
}

export function TeamDashboard({ groupId, userId, onLeave }: { groupId: string, userId: string, onLeave: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Fetch initial contacts
    fetch(`/api/groups/${groupId}/contacts`)
      .then(res => res.json())
      .then((data: any) => {
        if (data.success) {
          setContacts(data.data);
        }
      });

    // Establish WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/groups/${groupId}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'CONTACT_LOCKED') {
        setContacts(prev => prev.map(c => c.id === msg.contactId ? { ...c, status: 'locked', locked_by: msg.userId } : c));
      } else if (msg.type === 'CONTACT_UNLOCKED') {
        setContacts(prev => prev.map(c => c.id === msg.contactId ? { ...c, status: 'available', locked_by: null } : c));
      } else if (msg.type === 'CONTACT_COMPLETED') {
        setContacts(prev => prev.map(c => c.id === msg.contactId ? { ...c, status: 'completed' } : c));
      }
    };

    return () => {
      ws.close();
    };
  }, [groupId]);

  const lockContact = (contactId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'LOCK_CONTACT', contactId, userId }));
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status: 'locked', locked_by: userId } : c));
  };

  const completeContact = (contactId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'COMPLETE_CONTACT', contactId, userId }));
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status: 'completed' } : c));
  };

  const unlockContact = (contactId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'UNLOCK_CONTACT', contactId, userId }));
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status: 'available', locked_by: null } : c));
  };

  return (
    <div className="container">
      <h2>Team Mode - Group: {groupId}</h2>
      <button onClick={onLeave}>Leave Group</button>
      
      <div style={{ marginTop: '20px' }}>
        <h3>Contacts</h3>
        <ul style={{ listStyleType: 'none', padding: 0 }}>
          {contacts.map(c => (
            <li key={c.id} style={{ padding: '10px', border: '1px solid #ccc', margin: '5px 0' }}>
              <strong>{c.name}</strong> - {c.phone}
              <br/>
              Status: <em>{c.status}</em> {c.locked_by && `(by ${c.locked_by})`}
              <div style={{ marginTop: '10px' }}>
                {c.status === 'available' && (
                  <button onClick={() => lockContact(c.id)}>Call & Lock</button>
                )}
                {c.status === 'locked' && c.locked_by === userId && (
                  <>
                    <button onClick={() => completeContact(c.id)}>Complete</button>
                    <button onClick={() => unlockContact(c.id)} style={{ marginLeft: '10px' }}>Unlock (Cancel)</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
