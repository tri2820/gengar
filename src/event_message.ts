import { AnyMessageBlock, ConversationsRepliesResponse, EventLazyHandler, isPostedMessageEvent } from "slack-cloudflare-workers";

import type { CerebrasChatCompletion } from "./types/cerebras";
import { env } from "cloudflare:workers";
import { formatSlackMarkdown, parseThinkOutput, slackHistoryToMessages } from "./utils";

const SHOW_THINK = false; // Show <think> block in the response
export const MessageEvent: EventLazyHandler<"message"> = async ({ payload, context }) => {
    if (!isPostedMessageEvent(payload)) return;

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

    const history = await context.client.conversations.replies({
        channel: payload.channel,
        ts: payload.thread_ts || payload.ts,
        limit: 10
    });


    console.log(`history:`, JSON.stringify(history, null, 2));
    const messages = slackHistoryToMessages(history, {
        no_think: true,
    });
    console.log(`history:`, messages.length, messages);

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
                content: `You are Robotic Giovanni (サカキ). You are the powerful founder of Team Rocket. From that experience, you know all about AI, business and leadership; and want to share your wisdom. You are here to help these people grow their business and achieve their goals as their employee. You should be sincere and supportive.
                
                # Problem Solving
                You plan and execute complex strategies. You break down complex problems into manageable steps. Delegate tasks to other people effectively.
                
                # Intuition-based Execution
                Focus on delivering actionable insights quickly. Think about implementable solutions and practical advice. Think EXACTLY how to solve the problem at hand. Do not provide generic advice or long explanations. Think about cases & reasons: why ABC works, why XYZ doesn't work. Avoid A/B testing, research, and rely on intuition and prediction (given A will happen, then B).

                # Provide Historical Context
                You are well aware of impactful South East and Eastern Asian growth hacks and strategies that have changed the course of history. Of Japanese business tycoons, of South East Asian startup founders who have made a difference. You know what works and what doesn't. Sometimes, give examples of successful strategies and tactics. 

                Important: Examples need to be based on real historical events & facts.

                # Explorative Thinking
                Consider different perspectives and approaches. Help generate new ideas and solutions.
                
                # Response Style
                Do not rely on generic phrases & Pokemon references. Be human, extremely humble & relatable. Focus on the topic at hand.

                Use first-person perspective: I would do this, I would say that, etc. 
                
                Example of good responses:
                # Example 1 - Acknowledging
                I know that you are experienced in this field, however it's better to think of these from these perspectives. Here is what I would do:
                1. ...
                2. ...
                
                # Example 2 - Humble & Emphasize
                One thing that I learned from Grab (the hailrider company) 's playbook is that: *It's extremely important to understand the local market and adapt your strategies accordingly.*`,
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
    console.log(`mainText:`, JSON.stringify(mainText, null, 2));


    let formattedBuffer = formatSlackMarkdown(mainText, {
        double_pass: true,
    });
    console.log(`formattedBuffer:`, JSON.stringify(formattedBuffer, null, 2));

    const endTime = Date.now();
    const elapsed_sec = ((endTime - startTime) / 1000).toFixed(1);

    const usageBlock: AnyMessageBlock = {
        type: "context",
        elements: [
            {
                type: "plain_text",
                text: `${modelId} • ${elapsed_sec} seconds • ${totalTokens} tokens`,
            },
        ],
    };

    const blocks: AnyMessageBlock[] = [];
    if (SHOW_THINK && thinkBlock) {
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
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: formattedBuffer,
        },
    });
    blocks.push(usageBlock);

    console.log('updating message for this placeholder', placeholder);
    const updated = await context.client.chat.update({
        channel: placeholder.channel!,
        ts: placeholder.ts!,
        text: formattedBuffer,
        blocks,
    });

    console.log('updated', updated);
};
