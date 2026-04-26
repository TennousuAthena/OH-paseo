import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "expo-router";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useHostRuntimeBootstrapState, useStoreReady } from "@/app/_layout";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { buildHostRootRoute } from "@/utils/host-routes";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";

const WELCOME_ROUTE = "/welcome";

function useEarliestOnlineHostServerId(): string | null {
  const runtime = getHostRuntimeStore();
  return useSyncExternalStore(
    (onStoreChange) => runtime.subscribeAll(onStoreChange),
    () => runtime.getEarliestOnlineHostServerId(),
    () => null,
  );
}

const isDesktop = shouldUseDesktopDaemon();

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();
  const bootstrapState = useHostRuntimeBootstrapState();
  const storeReady = useStoreReady();
  const anyOnlineServerId = useEarliestOnlineHostServerId();

  useEffect(() => {
    if (!storeReady) {
      return;
    }
    if (pathname !== "/" && pathname !== "") {
      return;
    }

    const targetRoute = anyOnlineServerId ? buildHostRootRoute(anyOnlineServerId) : WELCOME_ROUTE;
    router.replace(targetRoute);
  }, [anyOnlineServerId, pathname, router, storeReady]);

  return <StartupSplashScreen bootstrapState={isDesktop ? bootstrapState : undefined} />;
}
