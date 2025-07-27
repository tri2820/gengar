import { EventLazyHandler, SlackEdgeAppEnv } from "slack-cloudflare-workers";

export const AppHomeOpened: EventLazyHandler<"app_home_opened"> = async ({ context }) => {
    console.log(`App home opened by user: ${context.userId}`);
    await context.client.views.publish({
        user_id: context.userId!,
        view: {
            type: "home",
            callback_id: "home_view",

            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Welcome to Giant Gengar Bot!*"
                    }
                },
                {
                    type: "divider"
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "Here are some things you can do:"
                    }
                },
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: "Do something!"
                            },
                            action_id: "button-action"
                        }
                    ]
                }
            ]
        }
    });
}