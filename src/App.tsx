import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AdminDashboard } from "./components/AdminDashboard";
import { CallerDashboard } from "./components/CallerDashboard";

// You can find this in your Clerk Dashboard -> API Keys
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function App() {
  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in/*" element={<SignInPage />} />
          
          {/* Protected Routes */}
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/call" element={<ProtectedRoute role="caller"><CallerDashboard /></ProtectedRoute>} />
          
          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/call" replace />} />
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  );
}

// Simple redirect if not logged in
function SignInPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
      <SignedIn><Navigate to="/call" replace /></SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </div>
  );
}

// Placeholder for role-based routing (In a real app, fetch role from an API endpoint or Clerk metadata)
function ProtectedRoute({ children, role }: { children: React.ReactNode, role: string }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}

export default App;