import type { ReactNode } from "react";
import { useHostRuntimeBootstrapState } from "@/app/_layout";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";

export function HostRouteBootstrapBoundary({ children }: { children: ReactNode }) {
  const bootstrapState = useHostRuntimeBootstrapState();

  if (bootstrapState.startupBlocker.kind !== "none") {
    return <StartupSplashScreen bootstrapState={bootstrapState} />;
  }

  return children;
}
