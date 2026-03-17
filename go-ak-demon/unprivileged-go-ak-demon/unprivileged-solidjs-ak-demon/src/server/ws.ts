// 1. Determine the correct WebSocket protocol based on the HTTP protocol
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

// 2. Get the current host (this includes the domain and the port if there is one)
const host = window.location.host;

// 3. Construct the full WebSocket URL
const wsUrl = `${wsProtocol}//${host}/ws`;

let socket: WebSocket;

export const initWS = () => {
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log("WebSocket connection established!");
  };

  socket.onmessage = (event) => {
    // event.data contains the message sent by the server
    const incomingMessage = event.data;

    // Update the SolidJS signal to trigger a UI re-render
    // setMessages((prev) => [...prev, incomingMessage]);

    console.log(incomingMessage);
  };

  // 5. Handle potential errors
  socket.onerror = (error) => {
    console.error("WebSocket Error:", error);
  };

  return {
    unSub: () => {
      if (socket && socket.readyState === socket.OPEN) socket.close();
    },
  };
};

type Msg = {
  type: "TEST" | "SEND_TEST_MSG_TO_PRI" | "SEND_TEST_MSG_TO_MOB_BT";
  msg?: null;
} | {
  type: "Offer";
  msg: Object
};

export const sendMsg = <T extends Msg>(type: T["type"], msg: T["msg"]) => {
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type, msg }));
  } else {
    console.log("No ws", socket.readyState);
  }
};
