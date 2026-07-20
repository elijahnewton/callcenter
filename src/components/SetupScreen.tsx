/* ============================================
   SETUP SCREEN (Clean Theme Integration)
   ============================================ */
.setup-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: var(--bg-main);
  padding: 1rem;
  transition: background-color 0.2s ease;
}

.setup-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2.5rem 2rem;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.setup-card h1 {
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
  color: var(--neutral-900);
  font-weight: 700;
}

.setup-card p {
  color: var(--neutral-400);
  margin-bottom: 2rem;
  font-size: 0.9rem;
}

.setup-card .form-group label {
  color: var(--neutral-600);
}

.setup-btn {
  width: 100%;
  padding: 0.875rem;
  background-color: var(--primary);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.1s ease;
  box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2);
}

.setup-btn:hover {
  background-color: var(--primary-dark);
  transform: translateY(-1px);
}

.setup-btn:active {
  transform: translateY(0);
}

@media (min-width: 900px) { 
  .main-layout { 
    grid-template-columns: 1.2fr 1fr; 
  } 
}