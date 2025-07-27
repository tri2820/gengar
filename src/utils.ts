import { ConversationsRepliesResponse } from 'slack-cloudflare-workers';
import { toMRKDWN } from './mrkdwn';

export type AIMessagesFormat = {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
};



export function parseThinkOutput(aiResponseText: string) {

    // Split <think> block from main text
    let thinkBlock = '';
    let mainText = aiResponseText;
    const thinkMatch = aiResponseText.match(/^<think>([\s\S]*?)<\/think>|^<think>([\s\S]*?)(\n\n|$)/);
    if (thinkMatch) {
        thinkBlock = (thinkMatch[1] || thinkMatch[2] || '').trim();
        mainText = aiResponseText.replace(/^<think>[\s\S]*?<\/think>\n*|^<think>[\s\S]*?(\n\n|$)/, '').trim();
    }

    return { thinkBlock, mainText };
}


export function formatSlackMarkdown(text: string): string {
    // Convert markdown to Slack format
    let formatted = toMRKDWN(text);

    // Replace triple backslash n (\\\n) with real newline
    formatted = formatted.replace(/\\\n/g, '\n');
    // Replace double backslash n (\\n) with real newline
    formatted = formatted.replace(/\\n/g, '\n');
    return formatted;
}

export function slackMessagesToAIMessages(history: ConversationsRepliesResponse): AIMessagesFormat[] {
    const extractTextFromBlocks = (blocks?: any[]): string | undefined => {
        if (!Array.isArray(blocks)) return undefined;
        for (const block of blocks) {
            // Return only the first 'section' block with 'mrkdwn' type
            if (block.type === 'section' && block.text && block.text.type === 'mrkdwn' && typeof block.text.text === 'string') {
                // Remove trailing context like 'Answered in ... tokens.'
                return block.text.text.trim();
            }
        }
        // Fallback: rich_text extraction (legacy)
        let result = '';
        for (const block of blocks) {
            if (block.type === 'rich_text' && Array.isArray(block.elements)) {
                for (const el of block.elements) {
                    if (el.type === 'rich_text_section' && Array.isArray(el.elements)) {
                        for (const subEl of el.elements) {
                            if (subEl.type === 'text' && typeof subEl.text === 'string') {
                                result += subEl.text;
                            }
                        }
                    }
                }
            }
        }
        result = result.replace(/Answered in [\d\.]+ seconds \([\d,]+ tokens\)\.?$/m, '').trim();
        return result.length > 0 ? result : undefined;
    };

    return (history.messages ?? [])
        .filter((msg) => {
            const blockText = extractTextFromBlocks((msg as any).blocks);
            const contentText = blockText ?? msg.text;
            return (
                typeof contentText === "string" &&
                contentText.length > 0 &&
                (msg as any).subtype !== "assistant_app_thread"
            );
        })
        .map((msg) => {
            const blockText = extractTextFromBlocks((msg as any).blocks);
            const contentText = blockText ?? msg.text;
            return {
                role: msg.bot_id ? "assistant" : "user",
                content: msg.bot_id ? contentText as string : `${contentText}` as string
            } as const;
        });
}

export function trimAIMessagesToBudget(messages: AIMessagesFormat[], history_chars_limit: number = 30000): AIMessagesFormat[] {
    // Remove tail AI messages
    // Remove consecutive assistant messages from the end
    let lastUserIdx = messages.length - 1;
    while (lastUserIdx >= 0 && messages[lastUserIdx].role === "assistant") {
        lastUserIdx--;
    }
    // Keep up to and including the last non-assistant message
    const trimmedMessages = messages.slice(0, lastUserIdx + 1);
    const messagesToUse = trimmedMessages;

    // Keep only the most recent messages whose combined content is <= history_chars_limit chars
    let totalLength = 0;
    const recent: AIMessagesFormat[] = [];

    for (let i = messagesToUse.length - 1; i >= 0; i--) {
        let msg = messagesToUse[i];
        if (totalLength + msg.content.length > history_chars_limit) {
            // Try to fit a slice of the last message
            const remaining = history_chars_limit - totalLength;
            if (remaining > 0) {
                recent.unshift({
                    ...msg,
                    content: `...${msg.content.slice(-remaining)}`
                });
            }
            break;
        }
        recent.unshift(msg);
        totalLength += msg.content.length;
    }
    return recent;
}

export const notEmpty = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;
// Split formattedBuffer into blocks respecting word boundaries, add ... at the tail of each block except the last
export function splitToChunks(text: string, maxLen: number = 3000): string[] {
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