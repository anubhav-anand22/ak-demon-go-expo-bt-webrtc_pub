import { onCleanup, onMount, Suspense, type Component } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { initWS, sendMsg } from "./server/ws";

const App: Component<{ children: Element }> = (props) => {
  const location = useLocation();

  onMount(() => {
    const { unSub } = initWS();

    onCleanup(() => {
      unSub();
    });
  });

  return (
    <>
      <nav class="bg-gray-200 text-gray-900 px-4">
        <ul class="flex items-center">
          <li class="py-2 px-4">
            <A href="/" class="no-underline hover:underline">
              Home
            </A>
          </li>
          <li class="py-2 px-4">
            <A href="/about" class="no-underline hover:underline">
              About
            </A>
          </li>
          <li class="py-2 px-4">
            <A href="/error" class="no-underline hover:underline">
              Error
            </A>
          </li>

          <li class="text-sm flex items-center space-x-1 ml-auto">
            <span>URL:</span>
            <input
              class="w-75px p-1 bg-white text-sm rounded-lg"
              type="text"
              readOnly
              value={location.pathname}
            />
          </li>
        </ul>
      </nav>

      <button
        onClick={() => {
          sendMsg("TEST", null);
        }}
      >
        Send msg
      </button>
      <button
        onClick={() => {
          sendMsg("SEND_TEST_MSG_TO_PRI", null);
        }}
      >
        Send msg to pri
      </button>
      <button
        onClick={() => {
          sendMsg("SEND_TEST_MSG_TO_MOB_BT", null);
        }}
      >
        Send msg msg to mob via bt
      </button>

      <main>
        <Suspense>{props.children}</Suspense>
      </main>
    </>
  );
};

export default App;
