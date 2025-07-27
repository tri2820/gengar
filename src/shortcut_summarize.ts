import { env } from "cloudflare:workers";
import { ChatPostMessageResponse, GlobalShortcut, MessageShortcut, ShortcutLazyHandler, SlackAPIClient, SlackEdgeAppEnv } from "slack-cloudflare-workers";
import { CerebrasChatCompletion } from "./types/cerebras";
import { Message, SlackFile } from "./types/message";
import { formatSlackMarkdown, notEmpty, parseThinkOutput, splitToBlocks } from "./utils";

async function showView(client: SlackAPIClient, payload: GlobalShortcut | MessageShortcut, text: string = "Nothing to summarize!") {
    await client.views.open({
        trigger_id: payload.trigger_id,
        view: {
            type: "modal",
            callback_id: "view_1",
            title: { type: "plain_text", text: "Summary" },
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'plain_text',
                        text
                    }
                }
            ],
        },
    });
}

async function filesToChunks(files: SlackFile[]) {

    let conversions = (await Promise.all(files.map(async file => {

        try {
            const url = file.url_private;
            console.log("File URL:", url);
            const resp = await fetch(url, {
                method: "GET",
                headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
            })

            const blob = await resp.blob();
            console.log("File Blob:", blob);
            const conversion = await env.AI.toMarkdown({
                name: file.name,
                blob
            })

            return conversion;
        } catch {
            console.warn("Error processing file:", file.name);
            // no-op
            return;
        }
    }))).filter(notEmpty);

    conversions.sort((a, b) => {
        return a.tokens - b.tokens;
    });

    console.log("Conversions:", conversions);

    let totalBudget = 40000;
    const minBudget = conversions.length * 100; // At least 100 characters per file
    if (minBudget > totalBudget) {
        return {
            error: {
                message: `Not enough budget to process all files.`
            }
        }
    }


    const chunks = conversions.map((c, i) => {
        const markdown = c.data;
        const num_files_remaining = conversions.length - i;
        const allocated = Math.min(markdown.length, totalBudget - (num_files_remaining * 100));
        totalBudget -= allocated;
        return markdown.slice(0, allocated);
    })
    return {
        data: chunks
    }
}

export const SummarizeShortcut: ShortcutLazyHandler<SlackEdgeAppEnv> = async ({ context, payload }) => {

    console.log("Summarize shortcut triggered with payload:", JSON.stringify(payload, null, 2));


    // Type guard for MessageShortcut
    if (!('message' in payload)) {
        console.warn("Invalid payload: 'message' field is missing.");
        await showView(context.client, payload);
        return;
    }


    try {
        const result = await context.client.conversations.info({
            channel: payload.channel.id
        });
        console.log("Channel info:", result);
    } catch {
        console.error("This channel is not accessible by the app.");
        try {
            const result = await context.client.conversations.join({
                channel: payload.channel.id
            });
            console.log("Joined channel:", payload.channel.id, result);
        } catch (error) {
            console.error("Error joining channel:", error);
            await showView(context.client, payload, 'This channel is not accessible by the bot. Please make sure the bot is invited to this channel!');
            return;
        }
    }


    console.log("Valid payload with message:", payload.message);
    const msg = payload.message as Message;
    if (!msg.text && (!msg.files || msg.files.length === 0)) {
        console.warn("No files to summarize in the message.");
        await showView(context.client, payload);
        return;
    }

    console.log("Message has text or files to summarize:", msg);


    console.log('wait postMessage', payload.channel.id, payload.message.ts);
    let placeholder: ChatPostMessageResponse;
    try {
        placeholder = await context.client.chat.postMessage({
            channel: payload.channel.id,
            thread_ts: payload.message.ts,
            text: 'some text',
            reply_broadcast: false,
            blocks: [
                {
                    type: "context",
                    elements: [
                        {
                            type: "plain_text",
                            text: `Summarizing message${msg.files ? ` and ${msg.files.length} ${msg.files.length > 1 ? 'files' : 'file'}` : ''}. This may take a moment...`
                        },
                    ],
                }
            ]
        });
    } catch (error) {
        console.error("Error posting placeholder message:", error);
        return;
    }

    console.log("Placeholder message sent:", placeholder);


    let chunks: string[] = [];
    if (msg.files) {
        const result = await filesToChunks(msg.files);
        if (result.error) {
            await context.client.chat.update({
                ts: placeholder.ts!,
                channel: placeholder.channel!,
                text: '',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'plain_text',
                            text: `Error: ${result.error.message}`
                        }
                    }
                ]
            });
            return;
        }
        chunks = result.data;
    }


    const messageText = `# Message\n${payload.message.text}`
    const filesText = chunks.map((chunk, i) => `File ${i + 1}:\n${chunk}`).join("\n\n");
    const content = `${messageText}\n\n${filesText}\\no_think`;


    const modelId = `qwen-3-235b-a22b`;
    const cerebrasPayload = {
        model: modelId,
        max_tokens: 40000,
        temperature: 0.6,
        top_p: 0.95,
        messages: [
            {
                role: "system",
                content: `You are a helpful assistant that summarizes messages & files. 
                Use only the files I provide — do not make up sources. 
                
                Summary must be concise, in simple English to understand easily, and under 300 characters.`,
            },
            {
                role: "user",
                content
            }
        ],
    };
    const cerebrasResponse = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.CEREBRAS_API_KEY}`
        },
        body: JSON.stringify(cerebrasPayload)
    });


    const cerebrasData = await cerebrasResponse.json() as CerebrasChatCompletion;
    let aiResponseText = cerebrasData.choices?.[0]?.message?.content ?? "(No response)";

    const { mainText } = parseThinkOutput(aiResponseText);

    let formattedBuffer = formatSlackMarkdown(mainText, {
        double_pass: true,
    });

    const blocks = splitToBlocks(formattedBuffer);

    console.log(`formattedBuffer blocks:`, JSON.stringify(blocks, null, 2));
    try {
        const updateResponse = await context.client.chat.update({
            ts: placeholder.ts!,
            channel: placeholder.channel!,
            text: 'Some text',
            blocks: blocks.map(block => ({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: block
                }
            }))
        });
    } catch (error) {
        console.error("Error updating message:", error);
    }

    console.log("Updated with summary");
};
