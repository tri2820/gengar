import { AnyMessageBlock, ConversationsRepliesResponse, EventLazyHandler } from "slack-cloudflare-workers";
import { AIMessagesFormat, formatSlackMarkdown, parseThinkOutput, slackMessagesToAIMessages, trimAIMessagesToBudget, splitToChunks } from "../utils";
import { SYSTEM_PROMPT } from "./system";
import { env } from "cloudflare:workers";
import { CerebrasChatCompletion } from "../types/cerebras";
import { search_tool } from "./search_tool";


async function inference(messages: AIMessagesFormat[], iter_idx = 0) {

    let tool_logs: string[] = []
    let called_tool = false;
    const tools = {
        'search_tool': search_tool
    }

    // console.log(`messages:`, JSON.stringify(messages, null, 2));
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
                content: SYSTEM_PROMPT(iter_idx),
            },
            ...messages,
        ],
        // Add tools definition to enable function calling
        tools: [
            {
                type: "function",
                function: {
                    name: "search_tool",
                    description: "Search Tool",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query string. Best to use simple, generic terms & 3-4 words. Should do multiple searches.",
                            }
                        },
                        required: ["query"]
                    }
                }
            }
        ]
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
    console.log(`cerebrasData:`, JSON.stringify(cerebrasData, null, 2));

    const new_messages = [...messages]
    const choice = cerebrasData.choices?.[0];

    // First, add the assistant's message with tool calls to the messages array
    new_messages.push(choice.message as AIMessagesFormat);

    const toolCalls = choice.message.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
        called_tool = true;


        // Execute all tool calls in parallel using Promise.all
        const toolPromises = toolCalls.map(async (toolCall) => {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);
            console.log(`Calling tool: ${toolName} with args:`, toolArgs);

            const tool = tools[toolName as keyof typeof tools];
            if (!tool) {
                console.warn(`No such tool: ${toolName}`);
                return null;
            }

            const log = toolName == 'search_tool' ?
                `_🔧 Searched for: ${toolArgs.query}_` :
                `_🔧 Called tool: ${toolName} with args: ${JSON.stringify(toolArgs)}_`;

            tool_logs.push(log);

            const result = await tool(toolArgs.query);

            // Craft a tool result message
            return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(result.ai_input),
            };
        });

        // Wait for all tool calls to complete and filter out null results
        const toolResults = (await Promise.all(toolPromises)).filter(result => result !== null);

        // Add all tool results to messages
        new_messages.push(...toolResults);
    }

    return {
        tool_logs,
        messages: new_messages,
        cerebrasData,
        modelId,
        called_tool
    }
}

type Req = Parameters<EventLazyHandler<"message"> | EventLazyHandler<"app_mention">>[0];
export default async function flow_conversation(req: Req, opts: {
    show_think?: boolean, context_decorator?: (props: {
        modelId: string;
        elapsed_sec: string;
        totalTokens: string | number;
        messages: AIMessagesFormat[];
    }) => string
} & ({ type: 'thread', ts: string } | { type: 'channel' })) {
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
                // Old -> New
                history.messages?.reverse();
            }


            console.log(`history:`, JSON.stringify(history, null, 2));

            messages = slackMessagesToAIMessages(history);
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


    let updated_placeholder = false;
    const placeholder = await placeholderPromise;
    let tools_logs: string[] = [];
    let result: Awaited<ReturnType<typeof inference>> | undefined = undefined;
    let iteration = 0;
    let need_to_continue = true;
    while (iteration < 10 && need_to_continue) {
        iteration++;
        console.log(`[=>] Iteration ${iteration}:`, JSON.stringify(messages, null, 2));
        messages = trimAIMessagesToBudget(messages);
        result = await inference(messages, iteration);
        const text = result.cerebrasData.choices?.[0]?.message?.content;
        if (text) {
            console.log(`AI said:`, text);
        }

        if (result.tool_logs.length > 0) {
            tools_logs.push(...result.tool_logs);
            const blocks: AnyMessageBlock[] = tools_logs.map(log => ({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: log
                }
            }));

            updated_placeholder = true;
            context.client.chat.update({
                channel: placeholder.channel!,
                ts: placeholder.ts!,
                text: '',
                blocks,
            });
        }


        console.log(`result called_tool:`, result.called_tool);
        if (result.called_tool) {
            console.log(`Called tool, continuing...`);
            messages = result.messages; // Update messages with the new ones including tool calls

        } else {
            console.log(`No more tool calls, breaking...`);
            need_to_continue = false;
        }
    }

    console.log('result:', JSON.stringify(result, null, 2));

    if (!result) {
        console.error("Inference failed, no result returned.");
        return;
    }

    let aiResponseText = result.cerebrasData.choices?.[0]?.message?.content ?? "(No response)";
    const totalTokens = result.cerebrasData.usage?.total_tokens ?? "?";
    console.log(`Total tokens used:`, totalTokens);
    const { thinkBlock, mainText } = parseThinkOutput(aiResponseText);


    let formattedBuffer = formatSlackMarkdown(mainText, {
        double_pass: true,
    });

    const endTime = Date.now();
    const elapsed_sec = ((endTime - startTime) / 1000).toFixed(1);

    const usageBlock: AnyMessageBlock = {
        type: "context",
        elements: [
            {
                type: "plain_text",
                text: opts.context_decorator ? opts.context_decorator({
                    modelId: result.modelId,
                    elapsed_sec,
                    totalTokens,
                    messages,
                }) : `${result.modelId} • ${elapsed_sec} seconds • ${totalTokens} tokens • ${messages.length} context messages`,
            },
        ],
    };


    const chunks = splitToChunks(formattedBuffer);
    console.log(`Split into ${chunks.length} chunks.`);
    try {

        for (let i = 0; i < chunks.length; i++) {
            const blocks: AnyMessageBlock[] = [];
            const chunk = chunks[i];
            if (i === 0) {
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

            }
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: chunk,
                },
            });


            if (i == chunks.length - 1) {
                blocks.push(usageBlock);
            }

            console.log('updated_placeholder', updated_placeholder)
            if (updated_placeholder) {
                await context.say({
                    text: '',
                    blocks
                });
            } else {
                updated_placeholder = true;
                await context.client.chat.update({
                    channel: placeholder.channel!,
                    ts: placeholder.ts!,
                    text: '',
                    blocks,
                });
            }
        }



    } catch (error) {
        console.error("Error adding message:", error);
    }



    console.log('updated');
}
