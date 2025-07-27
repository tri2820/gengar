import { EventLazyHandler, isPostedMessageEvent } from "slack-cloudflare-workers";

import flow_conversation from "./ai/flow_convertsation";

export const MessageEvent: EventLazyHandler<"message"> = async (req) => {
    if (!isPostedMessageEvent(req.payload)) return;
    await flow_conversation(req, { type: 'thread', ts: req.payload.thread_ts! });
};
