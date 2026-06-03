// SPEC-WEB-2: App renders the live Dashboard wrapped in an ErrorBoundary so
// Session.fromScenario() failures (missing content, bad seed) surface as a message
// rather than a blank/broken React tree.
import { Component, type ReactNode } from "react";
import { Dashboard } from "./Dashboard";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render(): ReactNode {
    if (this.state.error) {
      return (
        <pre style={{ color: "#c92a2a", padding: 24, fontFamily: "monospace" }}>
          {this.state.error.message}
        </pre>
      );
    }
    return this.props.children;
  }
}

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
