import type { FormEvent } from 'react';

interface SetupScreenProps {
  callerName: string;
  branchName: string;
  onCallerNameChange: (value: string) => void;
  onBranchNameChange: (value: string) => void;
  onSubmit: () => void;
}

export function SetupScreen({
  callerName,
  branchName,
  onCallerNameChange,
  onBranchNameChange,
  onSubmit,
}: SetupScreenProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>Welcome</h1>
        <p>Please enter your details to get started.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="caller-name">Your Name (Caller)</label>
            <input
              id="caller-name"
              type="text"
              value={callerName}
              onChange={(event) => onCallerNameChange(event.target.value)}
              placeholder="e.g., Elijah"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="branch-name">Branch/Church Name</label>
            <input
              id="branch-name"
              type="text"
              value={branchName}
              onChange={(event) => onBranchNameChange(event.target.value)}
              placeholder="e.g., Manifest Fellowship Kakiri"
              required
            />
          </div>
          <button type="submit" className="setup-btn">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}