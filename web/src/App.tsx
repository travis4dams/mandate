// SPEC-WEB-2: App renders the live Dashboard wrapped in an ErrorBoundary so
// Session.fromScenario() failures (missing content, bad seed) surface as a message
// rather than a blank/broken React tree.
// SPEC-WEB-10: a start screen precedes the game — scenario picker, optional
// seed, and the confirmation-hearing path; the chosen config boots Dashboard.
import { Component, useState, type ReactNode } from "react";
import { AppShell } from "./AppShell";
import { StartScreen, type StartConfig } from "./StartScreen";

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
  const [config, setConfig] = useState<StartConfig | null>(null);
  return (
    <ErrorBoundary>
      {config === null ? (
        <StartScreen onStart={setConfig} />
      ) : (
        <AppShell
          scenarioId={config.scenarioId}
          seed={config.seed}
          briefingId={config.briefingId}
          varDeltas={config.varDeltas}
        />
      )}
    </ErrorBoundary>
  );
}
