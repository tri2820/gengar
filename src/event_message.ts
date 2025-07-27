import { EventLazyHandler, isPostedMessageEvent } from "slack-cloudflare-workers";

import flow_conversation from "./ai/flow_convertsation";

export const MessageEvent: EventLazyHandler<"message"> = async (req) => {
    if (!isPostedMessageEvent(req.payload)) return;
    try {
        await flow_conversation(req, { type: 'thread', ts: req.payload.thread_ts!, show_think: true });
    } catch (e) {
        console.error("Error in MessageEvent handler:", e);
    }
};
