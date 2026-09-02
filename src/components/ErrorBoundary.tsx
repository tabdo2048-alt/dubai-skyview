import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

/**
 * Catches render/runtime errors in its subtree (e.g. a WebGL/map crash) and shows
 * a recoverable fallback instead of a blank white screen. React error boundaries
 * must be class components.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="grid h-full w-full place-items-center bg-background p-6 text-center">
        <div className="max-w-sm">
          <h2 className="font-display text-lg text-cream">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The map hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="glass gold-hairline mt-4 rounded-full px-4 py-2 text-sm text-cream transition-colors hover:text-gold"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
