import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import { PortalHost } from "@gorhom/portal";

export const DEFAULT_FLOATING_PANEL_PORTAL_HOST = "content-floating-panels";

const FloatingPanelPortalHostNameContext = createContext(DEFAULT_FLOATING_PANEL_PORTAL_HOST);

export function FloatingPanelPortalHostNameProvider({
  hostName,
  children,
}: {
  hostName: string;
  children: ReactNode;
}): ReactElement {
  return (
    <FloatingPanelPortalHostNameContext.Provider value={hostName}>
      {children}
    </FloatingPanelPortalHostNameContext.Provider>
  );
}

export function useFloatingPanelPortalHostName(): string {
  return useContext(FloatingPanelPortalHostNameContext);
}

export function FloatingPanelPortalHost({
  name = DEFAULT_FLOATING_PANEL_PORTAL_HOST,
}: {
  name?: string;
}): ReactElement {
  return <PortalHost name={name} />;
}
