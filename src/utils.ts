import { ConversationsRepliesResponse } from 'slack-cloudflare-workers';
import slackifyMarkdown from 'slackify-markdown';
export type AIMessagesFormat = {
    role: "user" | "assistant" | "system";
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


export function formatSlackMarkdown(text: string, opts?: {
    double_pass?: boolean; // If true, will run slackifyMarkdown twice to ensure proper formatting
}): string {
    // Convert markdown to Slack format
    let formatted = slackifyMarkdown(text);
    if (opts?.double_pass && formatted.includes('**')) {
        // Double pass to ensure proper formatting, this is just a workaround
        formatted = slackifyMarkdown(formatted)
    }
    // Replace triple backslash n (\\\n) with real newline
    formatted = formatted.replace(/\\\n/g, '\n');
    // Replace double backslash n (\\n) with real newline
    formatted = formatted.replace(/\\n/g, '\n');
    return formatted;
}

export function slackHistoryToMessages(history: ConversationsRepliesResponse, opts?: {
    no_think?: boolean;
    history_chars_limit?: number;
}): {
    messages: AIMessagesFormat[]
} {
    const HISTORY_CHARS_LIMIT = opts?.history_chars_limit ?? 1500;
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

    const messages = (history.messages ?? [])
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

    // Remove tail AI messages
    // Remove consecutive assistant messages from the end
    let lastUserIdx = messages.length - 1;
    while (lastUserIdx >= 0 && messages[lastUserIdx].role === "assistant") {
        lastUserIdx--;
    }
    // Keep up to and including the last non-assistant message
    const trimmedMessages = messages.slice(0, lastUserIdx + 1);
    const messagesToUse = trimmedMessages;

    // Keep only the most recent messages whose combined content is <= HISTORY_CHARS_LIMIT chars
    let totalLength = 0;
    const recent: AIMessagesFormat[] = [];

    for (let i = messagesToUse.length - 1; i >= 0; i--) {
        let msg = messagesToUse[i];



        // If this is the most recent message, append /no_think
        if (opts?.no_think && i === messages.length - 1) {
            msg = { ...msg, content: msg.content + " /no_think" };

        }
        if (totalLength + msg.content.length > HISTORY_CHARS_LIMIT) {
            // Try to fit a slice of the last message
            const remaining = HISTORY_CHARS_LIMIT - totalLength;
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
    return {
        messages: recent,

    }
}

export const notEmpty = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;
// Split formattedBuffer into blocks respecting word boundaries, add ... at the tail of each block except the last
export function splitToBlocks(text: string, maxLen: number = 2000): string[] {
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