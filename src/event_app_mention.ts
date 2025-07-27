import { EventLazyHandler } from "slack-cloudflare-workers";

export const AppMention: EventLazyHandler<"app_mention"> = async ({ context }) => {
    await context.client.chat.postMessage({
        channel: context.channelId,
        text: '', // Empty text to fix type error
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `:wave: <@${context.userId}> what's up?`,
                },
                accessory: {
                    type: "button",
                    text: { type: "plain_text", text: "Click Me" },
                    value: "click_me_123",
                    action_id: "button-action",
                },
            },
            {
                type: "context",
                elements: [
                    {
                        type: "plain_text",
                        text: "This message is posted by an app running on Cloudflare Workers",
                    },
                ],
            },
        ],
    });
};
