import {
	SlackApp,
	SlackEdgeAppEnv
} from "slack-cloudflare-workers";
import { ButtonActionHandler } from "./action_button_action";
import { AppHomeOpened } from "./event_app_home_opened";
import { AppMention } from "./event_app_mention";
import { AssistantThreadStarted } from "./event_assistant_thread_started";
import { MessageEvent } from "./event_message";
import { SummarizeShortcut } from "./shortcut_summarize";
import { TrendingNewsShortcut } from "./shortcut_trending_news";
import { ModalViewSubmission } from "./view_submission_modal";

import { env as cf_env } from "cloudflare:workers";
import { ImagineCommand } from "./command_imagine";


async function handleResourceRequest(
	request: Request,
): Promise<Response> {
	const url = new URL(request.url);
	const key = url.pathname.replace("/resource/", "");


	switch (request.method) {
		// case "PUT":
		// await cf_env.B_SLACKERS.put(key, request.body);
		// return new Response(`Put ${key} successfully!`);
		case "GET":
			const object = await cf_env.B_SLACKERS.get(key);

			if (object === null) {
				return new Response("Object Not Found", { status: 404 });
			}

			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set("etag", object.httpEtag);

			return new Response(object.body, {
				headers,
			});
		// case "DELETE":
		// 	await cf_env.B_SLACKERS.delete(key);
		// 	return new Response("Deleted!");

		default:
			return new Response("Method Not Allowed", {
				status: 405,
				headers: {
					Allow: "PUT, GET, DELETE",
				},
			});
	}
}

export default {
	async fetch(
		request: Request,
		env: SlackEdgeAppEnv,
		ctx: ExecutionContext
	): Promise<Response> {

		const url = new URL(request.url);

		// check if url starts with /resource/
		if (url.pathname.startsWith("/resource/")) {
			return await handleResourceRequest(request);
		}

		const app = new SlackApp({ env })
			.event("assistant_thread_started", AssistantThreadStarted)
			.event("app_home_opened", AppHomeOpened)
			.event("app_mention", AppMention)
			.event("message", MessageEvent)
			.action("button-action", ButtonActionHandler)
			.command("/imagine", async (req) => { }, ImagineCommand)
			.shortcut("summarize", async () => { }, SummarizeShortcut)
			.shortcut("trending-news", TrendingNewsShortcut)
			.viewSubmission("view_1", ModalViewSubmission);
		return await app.run(request, ctx);
	},
};
