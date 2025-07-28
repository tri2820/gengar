import { env } from "cloudflare:workers";

export type BraveNewsResult = {
    type: "news_result";
    title: string;
    url: string;
    description: string;
    age: string;
    page_age: string;
    meta_url: Record<string, any>;
    thumbnail?: Record<string, any>;
    extra_snippets?: string[];
};

export type BraveNewsResponse = {
    type: "news";
    query: {
        original: string;
        spellcheck_off: boolean;
        show_strict_warning: boolean;
    };
    results: BraveNewsResult[];
};

export async function search_tool(query: string) {
    // Use encodeURIComponent for the query
    const encodedQuery = encodeURIComponent(query);
    let response;
    try {
        console.log("Brave API fetch", `q=${encodedQuery}`, env.BRAVE_API_KEY);
        response = await fetch(
            `https://api.search.brave.com/res/v1/news/search?q=${encodedQuery}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    "Accept-Encoding": "gzip",
                    "x-subscription-token": env.BRAVE_API_KEY,
                },
            }
        );
        console.log("Brave API response status", response.status);
    } catch (err) {
        console.error("Brave API fetch error", err);
        throw new Error("Brave API fetch failed");
    }
    if (!response.ok) {
        console.error("Brave API error status", response.status);
        throw new Error(`Brave API error: ${response.status}`);
    }
    const body = await response.json();
    const result = body as BraveNewsResponse;
    // Clone and reduce result for AI input
    const ai_input = {
        ...result,
        // Remove unwanted keys from query
        query: {
            original: result.query.original
        },
        results: result.results.map(item => {
            return {
                title: item.title,
                age: item.age,
                extra_snippets: item.extra_snippets,
                url: item.url,
            };
        })
    };
    return {
        ai_input
    }
}
