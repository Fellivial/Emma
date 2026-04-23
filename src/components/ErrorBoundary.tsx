"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[EMMA] Render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans px-4">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emma-300/20 to-emma-400/10 border border-emma-300/15 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">😵</span>
            </div>
            <h2 className="text-sm font-medium text-emma-300 mb-2">
              Something broke, baby.
            </h2>
            <p className="text-xs font-light text-emma-200/30 mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 rounded-xl bg-emma-300/15 border border-emma-300/25 text-emma-300 text-xs font-light cursor-pointer hover:bg-emma-300/20 transition-all"
            >
              Let me try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
