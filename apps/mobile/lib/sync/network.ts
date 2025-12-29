import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/**
 * React hook for network state
 */
export function useNetworkState(): boolean {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  return isConnected;
}

/**
 * Get current network state (async)
 */
export async function getNetworkState(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}

/**
 * Get current network state (sync - returns last known state)
 */
let lastKnownState = true;

NetInfo.addEventListener((state: NetInfoState) => {
  lastKnownState = state.isConnected ?? false;
});

export function getNetworkStateSync(): boolean {
  return lastKnownState;
}
