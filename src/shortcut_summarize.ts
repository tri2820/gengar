import { env } from "cloudflare:workers";
import { AnyModalBlock, ShortcutLazyHandler, SlackAPIClient, SlackEdgeAppEnv, ViewsOpenResponse } from "slack-cloudflare-workers";
import { CerebrasChatCompletion } from "./types/cerebras";
import { Message } from "./types/message";
import { formatSlackMarkdown, parseThinkOutput } from "./utils";

export const SummarizeShortcut: ShortcutLazyHandler<SlackEdgeAppEnv> = async ({ context, payload }) => {
    // Type guard for MessageShortcut
    if (!('message' in payload)) {
        await context.client.views.open({
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
                            text: `Nothing to summarize! Please use this shortcut on a message with files or text.`
                        }
                    }
                ],
            },
        });
        return;
    }

    const msg = payload.message as Message;
    const notEmpty = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

    const placeholder = await context.client.chat.postMessage({
        channel: payload.channel.id,
        thread_ts: payload.message.ts,
        text: '',
        reply_broadcast: false,
        blocks: [
            {
                type: "context",
                elements: [
                    {
                        type: "plain_text",
                        text: `Summarizing message${msg.files.length > 0 ? ` and ${msg.files.length} ${msg.files.length > 1 ? 'files' : 'file'}` : ''}. This may take a moment...`
                    },
                ],
            }
        ]
    });


    let conversions = (await Promise.all(msg.files.map(async file => {

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
        await context.client.chat.update({
            ts: placeholder.ts!,
            channel: placeholder.channel!,
            text: '',
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'plain_text',
                        text: `Not enough budget to summarize ${conversions.length} files. Minimum budget is ${minBudget} characters.`
                    }
                }
            ]
        });


        return;
    }


    const chunks = conversions.map((c, i) => {
        const markdown = c.data;
        const num_files_remaining = conversions.length - i;
        const allocated = Math.min(markdown.length, totalBudget - (num_files_remaining * 100));
        totalBudget -= allocated;
        return markdown.slice(0, allocated);
    })

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
    const maxBlockLength = 2000;

    // Split formattedBuffer into blocks respecting word boundaries, add ... at the tail of each block except the last
    function splitToBlocks(text: string, maxLen: number): string[] {
        const blocks: string[] = [];
        let start = 0;
        while (start < text.length) {
            let end = start + maxLen;
            if (end >= text.length) {
                blocks.push(text.slice(start));
                break;
            }
            // Find last space before maxLen
            let lastSpace = text.lastIndexOf(' ', end);
            if (lastSpace <= start) lastSpace = end; // fallback: hard split
            let chunk = text.slice(start, lastSpace);
            blocks.push(chunk + ' ...');
            start = lastSpace + 1;
        }
        return blocks;
    }

    const blocks = splitToBlocks(formattedBuffer, maxBlockLength);

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
