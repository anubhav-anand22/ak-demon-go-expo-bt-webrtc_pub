import { BTHandler } from "@/lib/BTHandler";
import { useEffect, useState } from "react";

export const useBTConnection = () => {
  const [connectionState, setConnectionState] = useState(BTHandler.getInstance().connectionState);

  useEffect(() => {
    const unSub = BTHandler.getInstance().onConnectionChange((connectionState) => {
      setConnectionState(connectionState);
    });

    return () => {
      unSub();
    };
  }, []);

  return connectionState;
};
