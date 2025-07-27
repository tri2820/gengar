export async function mockSearchTool(query: string): Promise<{ results: [] }> {
    // Mock search tool that always returns 0 results
    console.log(`Mock search tool called with query: ${query}`);
    return { results: [] };
}
