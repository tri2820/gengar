import { EventLazyHandler } from "slack-cloudflare-workers";
import flow_conversation from "./ai/flow_convertsation";

export const AppMention: EventLazyHandler<"app_mention"> = async (req) => {
    await flow_conversation(req, {
        type: 'channel', context_decorator(props) {
            return `Tips: DM the Assistants app to chat privately • ${props.messages.length} context messages`;
        }
    });
};
