import { ViewSubmissionAckHandler, SlackEdgeAppEnv } from "slack-cloudflare-workers";

export const ModalViewSubmission: ViewSubmissionAckHandler<SlackEdgeAppEnv> = async () => {
    return { response_action: "clear" } as const;
};
