import { AnyMessageBlock, ConversationsRepliesResponse, EventLazyHandler } from "slack-cloudflare-workers";
import { AIMessagesFormat, formatSlackMarkdown, parseThinkOutput, slackHistoryToMessages, splitToBlocks } from "../utils";
import { SYSTEM_PROMPT } from "./system";
import { env } from "cloudflare:workers";
import { CerebrasChatCompletion } from "../types/cerebras";

type Req = Parameters<EventLazyHandler<"message"> | EventLazyHandler<"app_mention">>[0];
export default async function flow_conversation(req: Req, opts: { show_think?: boolean } & ({ type: 'thread', ts: string } | { type: 'channel' })) {
    const { payload, context } = req;

    const startTime = Date.now();

    const placeholderPromise = context.say({
        text: '', // Empty text to fix type error
        blocks: [
            {
                type: "context",
                elements: [
                    {
                        type: "plain_text",
                        text: `Thinking...`,
                    },
                ],
            }
        ],
    })

    const text: string = (payload as any).text;
    const no_history = text.includes('--no-history')

    let messages: AIMessagesFormat[] = [];
    if (!no_history) {
        console.log(`Fetching history for ${opts.type}...`);
        let history: ConversationsRepliesResponse;
        try {
            // Create a timeout promise
            const timeoutPromise = new Promise<ConversationsRepliesResponse>((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Slack API request timed out after 5 seconds'));
                }, 3000);
            });

            if (opts.type === 'thread') {
                history = await Promise.race([
                    context.client.conversations.replies({
                        channel: payload.channel,
                        ts: opts.ts,
                        limit: 10
                    }),
                    timeoutPromise
                ]);
            } else {
                history = await Promise.race([
                    context.client.conversations.history({
                        channel: payload.channel,
                        limit: 10
                    }),
                    timeoutPromise
                ]);
            }

            // console.log(`history:`, JSON.stringify(history, null, 2));
            const result = slackHistoryToMessages(history, {
                no_think: false,
            });

            messages = result.messages;
        } catch (error) {
            console.error("Error fetching conversation history:", error);
            // continue
        }
    }

    if (messages.length === 0) {
        console.log("No messages found in history, using current text as the only message.");
        messages = [
            {
                role: "user",
                content: text,
            }
        ]
    }

    console.log(`messages:`, JSON.stringify(messages, null, 2));
    const modelId = `qwen-3-235b-a22b`;
    // Non-streaming AI response using Cerebras API
    const cerebrasPayload = {
        model: modelId,
        max_tokens: 40000,
        temperature: 0.6,
        top_p: 0.95,
        messages: [
            {
                role: "system",
                content: SYSTEM_PROMPT(),
            },
            ...messages,
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

    console.log('got response', cerebrasResponse.ok)

    const cerebrasData = await cerebrasResponse.json() as CerebrasChatCompletion;




    let aiResponseText = cerebrasData.choices?.[0]?.message?.content ?? "(No response)";



    const totalTokens = cerebrasData.usage?.total_tokens ?? "?";
    const { thinkBlock, mainText } = parseThinkOutput(aiResponseText);

    const placeholder = await placeholderPromise;
    // console.log(`mainText:`, JSON.stringify(mainText, null, 2));


    let formattedBuffer = formatSlackMarkdown(mainText, {
        double_pass: true,
    });
    // console.log(`formattedBuffer:`, JSON.stringify(formattedBuffer, null, 2));

    const endTime = Date.now();
    const elapsed_sec = ((endTime - startTime) / 1000).toFixed(1);

    const usageBlock: AnyMessageBlock = {
        type: "context",
        elements: [
            {
                type: "plain_text",
                text: `${modelId} • ${elapsed_sec} seconds • ${totalTokens} tokens • ${messages.length} context messages`,
            },
        ],
    };

    const blocks: AnyMessageBlock[] = [];
    if (opts?.show_think && thinkBlock) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `\u0060\u0060\u0060\n${thinkBlock}\n\u0060\u0060\u0060`
            }
        });
        blocks.push({
            type: "divider"
        });
    }

    console.log('thinkBlock', thinkBlock);

    const chunks = splitToBlocks(formattedBuffer);
    for (const chunk of chunks) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: chunk,
            },
        })
    }
    blocks.push(usageBlock);

    console.log('updating message for this placeholder', placeholder.ts);

    try {
        const updated = await context.client.chat.update({
            channel: placeholder.channel!,
            ts: placeholder.ts!,
            text: formattedBuffer,
            blocks,
        });
    } catch (error) {
        console.error("Error updating message:", error);
    }

    console.log('updated');
}
