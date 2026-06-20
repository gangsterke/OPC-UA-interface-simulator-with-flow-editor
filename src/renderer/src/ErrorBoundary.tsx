import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// A render crash anywhere in the tree (e.g. a malformed loaded project, an
// unexpected step shape) would otherwise leave the whole window blank with
// no way to recover short of restarting - this at least shows what broke.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Renderer crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "sans-serif", padding: 24, color: "#c92a2a" }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Try to continue</button>
          <p style={{ fontSize: 12, color: "#666" }}>
            If this keeps happening, restart the app. Project data on disk is unaffected.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
