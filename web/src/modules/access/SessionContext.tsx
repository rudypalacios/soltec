import { can, type AuthSession, type SessionState } from '@soltec/shared';
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

/** Exported for tests that need a session without recovering it. Screens use the hooks below. */
export const SessionContext = createContext<AuthSession | null>(null);

/** Gives the screens the session and recovers it, once, when the page loads. */
export function SessionProvider({
  session,
  children,
}: {
  session: AuthSession;
  children: ReactNode;
}) {
  useEffect(() => {
    void session.restore();
  }, [session]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): AuthSession {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession needs a SessionProvider above it.');
  }
  return session;
}

/** The typed API client of the session: it carries the token and renews the session by itself. */
export function useApiClient() {
  return useSession().client;
}

/** The state of the session; the component renders again whenever it changes. */
export function useSessionState(): SessionState {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, session.getState);
}

/** The signed-in user, or null while anonymous, restoring or obliged to change the password. */
export function useCurrentUser() {
  const state = useSessionState();
  return state.status === 'authenticated' ? state.user : null;
}

/** Whether the signed-in user may do an action on a resource. Hides options; the server decides (ADR-0012). */
export function useCan() {
  const user = useCurrentUser();
  return (resource: string, action: string) => can(user, resource, action);
}
