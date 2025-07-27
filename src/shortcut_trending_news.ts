import { ShortcutAckHandler, SlackEdgeAppEnv } from "slack-cloudflare-workers";

export const TrendingNewsShortcut: ShortcutAckHandler<SlackEdgeAppEnv> = async ({ context, payload }) => {
    await context.client.views.open({
        trigger_id: payload.trigger_id,
        view: {
            type: "modal",
            callback_id: "modal",
            title: { type: "plain_text", text: "Trending News" },
            submit: { type: "plain_text", text: "Submit" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [],
        },
    });
};
