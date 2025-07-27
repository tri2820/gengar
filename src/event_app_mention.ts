import { EventLazyHandler } from "slack-cloudflare-workers";
import flow_conversation from "./ai/flow_convertsation";

export const AppMention: EventLazyHandler<"app_mention"> = async (req) => {
    await flow_conversation(req, { type: 'channel' });
};
