export interface ExplorerCheckoutContext {
  serverId: string;
  cwd: string;
  isGit: boolean;
}

let activeExplorerCheckout: ExplorerCheckoutContext | null = null;

export function getActiveExplorerCheckout(): ExplorerCheckoutContext | null {
  return activeExplorerCheckout;
}

export function setActiveExplorerCheckout(checkout: ExplorerCheckoutContext | null) {
  if (
    activeExplorerCheckout?.serverId === checkout?.serverId &&
    activeExplorerCheckout?.cwd === checkout?.cwd &&
    activeExplorerCheckout?.isGit === checkout?.isGit
  ) {
    return;
  }

  activeExplorerCheckout = checkout;
}
