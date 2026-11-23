import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string; operationType?: string };
      if (parsed.error && parsed.operationType) {
        readable = `Database ${parsed.operationType} denied on ${parsed.path ?? 'resource'}: ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h1 className="font-display text-lg font-semibold text-slate-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.href = '/';
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <RotateCcw className="h-4 w-4" />
              Reload Console
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
