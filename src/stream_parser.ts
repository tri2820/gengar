// ...existing code removed for new implementation below...
export interface ParsedChunk {
    response?: string;
    usage?: any;
}

// ...existing code removed for new implementation below...

export class Parser {
    buffer: string = "";
    usage: any = null;
    decoder: TextDecoder;
    reader: ReadableStreamDefaultReader<any>;
    doneReading: boolean = false;
    constructor(stream: ReadableStream<any>) {
        this.reader = stream.getReader();
        this.decoder = new TextDecoder();
    }

    async nextChunk() {
        const { value, done } = await this.reader.read();
        let chunkStr = value ? this.decoder.decode(value) : undefined;
        return { chunkStr, done };
    }


    private parse(content: string): ParsedChunk | null {
        content = content.trim();
        if (!content) return null;
        try {
            // console.log(`[Parser] Parsing content:`, content);
            return JSON.parse(content);
        } catch (error) {
            // no-op
            return null;
        }
    }

    private update(parsed: ParsedChunk | null, onUpdate: (buffer: string) => Promise<void>) {
        if (!parsed) return;
        if (parsed.response) {
            this.buffer += parsed.response;
            // console.log(`[Parser] Appended response:`, parsed.response);
        }
        if (parsed.usage) {
            this.usage = parsed.usage;
            // console.log(`[Parser] Updated usage:`, parsed.usage);
        }
        return onUpdate(this.buffer);
    }

    private removeDataPrefix(str: string) {
        return str.startsWith('data: ') ? str.slice(6) : str;
    }

    async streamLoop(onUpdate: (buffer: string) => Promise<void>) {
        let many = '';
        while (!this.doneReading) {
            const { chunkStr, done } = await this.nextChunk();
            if (done) {
                this.doneReading = true;
                // console.log('[Parser] Stream done.');
                break;
            }

            if (chunkStr) {
                many += chunkStr;

                // Split by '\ndata: ' but keep 'data: ' at the start of each chunk
                let parts = many.split(/\ndata: /g);
                // If the first part does not start with 'data: ', fix it
                if (parts.length && !parts[0].startsWith('data: ')) {
                    parts[0] = 'data: ' + parts[0];
                }

                // Process all but the last part (which may be incomplete)
                for (let i = 0; i < parts.length - 1; i++) {
                    let content = this.removeDataPrefix(parts[i]);
                    const parsed = this.parse(content);
                    await this.update(parsed, onUpdate);
                }
                // The last part may be incomplete, keep it for next chunk
                many = parts[parts.length - 1];
            }
        }
        // Try to parse any remaining data after stream ends
        let leftover = this.removeDataPrefix(many);
        const parsedLeftover = this.parse(leftover);
        await this.update(parsedLeftover, onUpdate);
    }
}