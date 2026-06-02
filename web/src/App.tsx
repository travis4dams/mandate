// SPEC-WEB-2: App renders the live Dashboard, which subscribes to a Session via
// useSession + useSyncExternalStore and exposes engine state + advance/reset controls.
import { Dashboard } from "./Dashboard";

export function App(): JSX.Element {
  return <Dashboard />;
}
