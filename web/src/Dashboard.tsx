// SPEC-WEB-2: dashboard for the engine. Previously contained the full economy
// view inline; the content has been moved into web/src/AppShell.tsx as part of
// SPEC-WEB-11 (Office of the Chair shell). Dashboard now delegates to AppShell
// so existing callers (App.tsx, tests) continue to work during the migration.
// The lead will switch App.tsx to import AppShell directly and retire this file.

import { AppShell, type AppShellProps } from "./AppShell";

export type { AppShellProps as DashboardProps };

export function Dashboard(props: AppShellProps): JSX.Element {
  return <AppShell {...props} />;
}
