import { useAuth } from "@clerk/clerk-react";
import { useState, useCallback } from "react";

export function useCallQueue() {
  const { getToken } = useAuth();
  const [currentContact, setCurrentContact] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNextContact = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/contacts/next", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}) // Org ID is extracted from JWT on backend
      });
      
      const data = await res.json();
      if (data.success) {
        setCurrentContact(data.contact);
      } else {
        setCurrentContact(null); // Queue is empty
      }
    } catch (error) {
      console.error("Locking error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  const submitDisposition = useCallback(async (contactId: string, disposition: string, notes: string) => {
    const token = await getToken();
    await fetch("/api/calls/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ contact_id: contactId, disposition, notes })
    });

    setCurrentContact(null); // Clear current contact
    await fetchNextContact(); // Immediately pull the next one in queue
  }, [getToken, fetchNextContact]);

  return { currentContact, isLoading, fetchNextContact, submitDisposition };
}