import { BTHandler } from "@/lib/BTHandler";
import { useEffect, useState } from "react";

export const useBTConnection = () => {
  const [isConnected, setIsConnected] = useState(BTHandler.getInstance().isConnected);

  useEffect(() => {
    const unSub = BTHandler.getInstance().onConnectionChange((isConnected) => {
      setIsConnected(isConnected);
    });

    return () => {
      unSub();
    };
  }, []);

  return isConnected;
};
