import type { BlockActionLazyHandler, ButtonAction } from "slack-cloudflare-workers";
import { BlockAction, SlackEdgeAppEnv } from "slack-cloudflare-workers";

export const ButtonActionHandler: BlockActionLazyHandler<"button", SlackEdgeAppEnv, BlockAction<ButtonAction>> = async ({ context }) => {
    if (!context.respond) return;
    await context.respond({ text: "Now working on it ..." });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate some work
    await context.respond({ text: "It's done :white_check_mark:" });
};
