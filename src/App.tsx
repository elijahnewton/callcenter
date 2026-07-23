// src/App.tsx
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, useAuth } from "@clerk/clerk-react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AdminDashboard } from "./components/AdminDashboard";
import { CallerDashboard } from "./components/CallerDashboard";
import { useEffect } from "react";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ✅ New component that syncs the user to D1
function SyncUser() {
  const { getToken } = useAuth();

  useEffect(() => {
    const sync = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.warn("User sync failed:", await res.text());
        } else {
          console.log("User synced to D1");
        }
      } catch (err) {
        console.error("Sync error:", err);
      }
    };
    sync();
  }, [getToken]);

  return null; // This component only does side effects
}

function App() {
  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in/*" element={<SignInPage />} />

          {/* Protected Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <SyncUser />  {/* 👈 runs sync before dashboard */}
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/call"
            element={
              <ProtectedRoute role="caller">
                <SyncUser />  {/* 👈 runs sync before dashboard */}
                <CallerDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/call" replace />} />
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  );
}

function SignInPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
      <SignedIn><Navigate to="/call" replace /></SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </div>
  );
}

function ProtectedRoute({ children, role }: { children: React.ReactNode, role: string }) {
  // (For now, role is not enforced – you can later implement a real check)
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}

export default App;