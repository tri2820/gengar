export type CerebrasChatCompletion = {
    id: string;
    choices: Array<{
        finish_reason: string;
        index: number;
        message: {
            content: string;
            role: string;
        };
    }>;
    created: number;
    model: string;
    system_fingerprint: string;
    object: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        prompt_tokens_details?: {
            cached_tokens: number;
        };
    };
    time_info?: {
        queue_time: number;
        prompt_time: number;
        completion_time: number;
        total_time: number;
        created: number;
    };
};
