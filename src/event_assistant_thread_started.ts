import { EventLazyHandler } from "slack-cloudflare-workers";

export const AssistantThreadStarted: EventLazyHandler<"assistant_thread_started"> = async ({ context }) => {
    console.log(`Assistant thread started`);
};
