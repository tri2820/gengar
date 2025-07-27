import { env } from 'cloudflare:workers';
import { SlackRequestWithRespond, SlackEdgeAppEnv, SlashCommand, AnyMessageBlock } from 'slack-cloudflare-workers';

// Convert styles to array format with key-value pairs
const stylesArray = [
    // Cinematic/Film/Photography styles
    { key: 'wide_low', value: 'photo of a person, extreme wide-angle lens (18-24mm), low-angle perspective to emphasize scale and power, shot from behind for a sense of mystery and detachment, cinematic depth with vanishing lines in frame, ambient daylight' },
    { key: 'widescreen', value: 'landscape shot in 16:9 aspect ratio, wide framing with leading lines or rule-of-thirds composition, cinematic camera lens (35mm or wider), horizon-centered or golden ratio layout, subtle vignetting, perfect for dramatic establishing shots' },
    { key: 'panorama', value: 'super wide panoramic photograph in 5:2 aspect ratio, shot with ultra-wide lens or stitched frames, vast icy landscape with atmospheric depth, contrast between cold whites and deep blues, expansive isolation, like IMAX nature cinematography' },
    { key: 'film_realism', value: 'portrait captured with 35mm film camera, Kodak Portra 400 film stock emulation, shallow depth of field (f/1.8-f/2.8), creamy bokeh, soft lighting with realistic tones, skin tones preserved naturally, ambient street or room light, high dynamic range look' },
    { key: 'polaroid', value: 'square-format portrait shot with Polaroid SX-70, slight film fade, white border framing, soft focus, overexposed highlights, warm nostalgic tone, evokes 80s family photos or analog documentary feel, natural imperfections in film' },
    // Lighting/Atmosphere styles
    { key: 'golden_hour', value: 'photo of a person during golden hour (shortly after sunrise or before sunset), soft warm light wrapping around subject, golden rim light on hair and shoulders, glowing ambient haze, natural flare, long shadows, emotional and romantic atmosphere' },
    { key: 'foggy', value: 'scene in thick fog or morning mist, diffused natural lighting with low contrast, reduced depth of field due to atmospheric haze, soft gray and blue color palette, cinematic mood with mysterious undertones, reminiscent of Nordic noir or Denis Villeneuve visuals' },
    { key: 'window_shadows', value: 'indoor portrait, natural light casting through a window with venetian blinds or patterned curtains, shadows falling across face and background, chiaroscuro effect, warm tones, interior drama style reminiscent of Roger Deakins or Edward Hopper compositions' },
    { key: 'window_lit', value: 'intimate portrait by a large window, natural daylight entering softly, shadows falling diagonally across face and background, shallow depth of field, serene or reflective mood, cinematic and painterly feel often used in slow drama or biopics' },
    { key: 'silhouette', value: 'person lit from behind with strong single-point light source, camera exposure set to highlight background, creating a clean silhouette with no facial detail, bold shape readability, deep shadows, high contrast, dramatic outline often used in story intros or suspense' },
    // Color grading/styles
    { key: 'desaturated', value: 'muted color grading with almost monochromatic palette (gray, olive, slate), increased grain, low-key lighting, hard shadows, minimal contrast, expression of despair or realism, similar to 70s cinema or modern social dramas like Ken Loach films' },
    { key: 'pastel_indie', value: 'pastel-colored wardrobe and setting (baby blue, pale pink, mint green), soft natural light with slight bloom, vintage lens artifacts or chromatic aberration, handheld framing, emotionally light tone, resembles Greta Gerwig or Wes Anderson\'s indie coming-of-age style' },
    { key: 'wes_anderson', value: 'symmetrical portrait composition, pastel-drenched color palette, deadpan expression, flat camera movement (minimal parallax), vintage wardrobe and props, 35mm-like grain, whimsical and theatrical tone, precise art direction in line with Wes Anderson\'s visual style' },
    // Emotional tone styles
    { key: 'happy', value: 'portrait of a smiling person, catchlight in eyes, ambient soft light or natural daylight, warm color palette, candid expression, shallow depth of field, shot handheld or on prime lens for intimacy, bright and uplifting tone' },
    { key: 'somber', value: 'moody portrait with downcast expression, directional soft light casting deep shadows on face, neutral to cool color grading, heavy atmosphere, expressive stillness, minimal background distractions, often used in dramatic or melancholic character arcs' },
    { key: 'tired', value: 'close-up of fatigued face, visible eye bags and subtle details, soft ambient lighting with low fill, muted and desaturated palette, framing slightly tilted or handheld for intimacy, visual storytelling of emotional or physical exhaustion' },
    // Futuristic/Tech styles
    { key: 'blade_runner', value: 'futuristic urban environment, nighttime rain, saturated neon signage, deep shadows and color contrast (purple, magenta, and cyan), wet reflective streets, noir-inspired framing, VFX haze and practical light sources, Blade Runner / cyber-noir aesthetic' },
    { key: 'cyberpunk', value: 'city at night with heavy neon presence, glowing signs, deep black shadows and high saturation in pink, purple, cyan, blue, wet pavement for light reflection, side or back lighting on characters, dystopian tech ambiance, inspired by Akira and Ghost in the Shell' },
    { key: 'neon_back', value: 'person walking away through a neon-lit alley, shot from behind, vibrant colored backlight (teal, pink, red), reflective wet surfaces, volumetric fog with glowing edge light, silhouetted figure, noir-futuristic feel, evoking Drive or cyberpunk noir' },
    { key: 'bluecore', value: 'futuristic or stylized character, blue color dominance in grading, cold lighting, high saturation with sharp contrast, clean tech-infused background, minimalistic framing, glowing lines or accents, resembles visual design in synthwave or Hyper Light Drifter aesthetic' },
    { key: 'spacepunk', value: 'sci-fi scene inside space station, glowing control panels, deep space black levels, luminous blues and purples, cool color grading, floating dust particles, backlit silhouettes, speculative future design language, retro-futurism meets high-concept sci-fi' },
    // Historical/Warrior styles
    { key: 'gladiator', value: 'Roman warrior in full armor, desaturated earth tones with dark navy and mahogany reds, dim ambient lighting with strong directional shadows, dusty environment, high-grain film texture or emulation, mood of burden and legacy, reminiscent of Ridley Scott\'s Gladiator' },
    { key: 'warrior', value: 'Germanic barbarian warrior depicted from low angle for dominance, gritty costume detail, strong natural light from the side or behind, deep shadows and dust in air, muted browns and steel gray tones, muscular physique emphasized, epic tone like The Northman or 300' },
    { key: 'steampunk', value: 'character wearing Victorian-era steampunk gear (goggles, brass, leather), cluttered mechanical background with pipes and gears, tungsten and candle-like lighting, warm amber color tone, shallow DOF, Jules Verne inspired mise-en-scène' },
    // Dramatic/Action styles
    { key: 'fiery_combo', value: 'woman in dramatic stance, engulfed in swirling fiery smoke and sparks, backlit with warm orange and cool teal contrast, strong rim lighting, volumetric fog effects revealing light rays, dynamic energy, stylized like a Zack Snyder or Michael Bay frame' },
    { key: 'tarantino', value: 'dynamic action scene, saturated colors (especially reds and yellows), strong backlight and fill, Dutch angles or fast zoom-ins, 70s grindhouse texture, gritty character styling, pop culture references, stylized violence or tension, inspired by Quentin Tarantino\'s direction' },
] as const;

// Create a map for quick lookup by key
const stylesMap = Object.fromEntries(stylesArray.map(s => [s.key, s.value]));

// Define the type for style keys
type StyleKey = typeof stylesArray[number]['key'];

export const ImagineCommand = async (req: SlackRequestWithRespond<SlackEdgeAppEnv, SlashCommand>) => {
    const { payload, context } = req;
    const commandText = payload.text || '';
    if (!commandText) {
        await context.respond({ text: 'Please provide a prompt to generate an image.', response_type: 'ephemeral' });
        return;
    }

    // Check for --list-styles flag
    if (commandText.trim() === '--list-styles') {
        const stylesList = stylesArray.map((s, i) => `${i + 1}. ${s.key}`).join('\n');
        await context.respond({
            text: `Available styles:\n${stylesList}`,
            response_type: 'ephemeral',
        });
        return;
    }

    // Parse command text to extract prompt and style parameter
    let prompt = commandText;
    let styleId: string | null = null;
    let styleIndex: number | null = null;

    // Check if -s <style-id> or -s <number> is present
    const styleMatch = commandText.match(/-s\s+(\S+)/);
    if (styleMatch) {
        const styleParam = styleMatch[1];
        // Check if the parameter is a number (for index)
        const num = parseInt(styleParam, 10);
        if (!isNaN(num) && num > 0 && num <= stylesArray.length) {
            styleIndex = num - 1; // Convert to 0-based index
        } else {
            styleId = styleParam;
        }
        // Remove the style parameter from the prompt
        prompt = commandText.replace(/\s*-s\s+\S+/, "").trim();
    }

    // Add style to prompt if specified
    let selectedStyle: string | null = null;
    if (styleIndex !== null) {
        selectedStyle = stylesArray[styleIndex].value;
    } else if (styleId && styleId in stylesMap) {
        selectedStyle = stylesMap[styleId];
    } else if (styleId !== null || styleIndex !== null) {
        // Only show error if user actually requested a style but it was invalid
        const stylesList = stylesArray.map((s, i) => `${i + 1}. ${s.key}`).join('\n');
        const invalidStyle = styleId || (styleIndex !== null ? styleIndex + 1 : 'unknown');
        await context.respond({
            text: `Unknown style: ${invalidStyle}. Available styles:\n${stylesList}`,
            response_type: "ephemeral"
        });
        return;
    }

    if (selectedStyle) {
        prompt = `${prompt}, ${selectedStyle}`;
    }

    // Send a real message as a placeholder so we can update it later
    const placeholderPromise = context.client.chat.postMessage({
        channel: payload.channel_id,
        text: '', // Empty text to fix type error
        blocks: [
            {
                type: 'context',
                elements: [
                    {
                        type: 'plain_text',
                        text: `Imagining...`,
                    },
                ],
            },
        ],
    });

    console.log(`Imagine command received with prompt: ${prompt}`);

    const modelId = '@cf/black-forest-labs/flux-1-schnell';
    const seed = Math.floor(Math.random() * 1000);
    const startTime = Date.now();
    try {
        // Use env.AI.run instead of fetch
        const aiResult = await env.AI.run(modelId, { prompt, seed });
        const imageBase64 = aiResult?.image;
        if (!imageBase64) {
            await context.respond({ text: 'Failed to generate image.', response_type: 'ephemeral' });
            return;
        }
        // Convert from base64 string
        const binaryString = atob(imageBase64);
        // Create byte representation
        const img = Uint8Array.from(binaryString, (m) => m.charCodeAt(0));

        const key = crypto.randomUUID() + '.jpeg';
        await env.B_SLACKERS.put(key, img);


        const baseUrl = req.headers.get("Host");
        const imageUrl = `${baseUrl}/resource/${key}`;

        const elapsed_sec = ((Date.now() - startTime) / 1000).toFixed(1);

        const usageBlock: AnyMessageBlock = {
            type: 'context',
            elements: [
                {
                    type: 'plain_text',
                    text: `${modelId} • ${elapsed_sec} seconds • s-${seed}`,
                },
            ],
        };

        const placeholder = await placeholderPromise;
        // Update the placeholder message with the image and usage blocks
        await context.client.chat.update({
            channel: payload.channel_id,
            ts: placeholder.ts!,
            text: '',
            blocks: [
                {
                    type: 'image',
                    title: {
                        type: 'plain_text',
                        text: `Picture for "${prompt}"`,
                    },
                    image_url: imageUrl,
                    alt_text: prompt,
                },
                usageBlock,
            ],
        });
    } catch (err) {
        await context.respond({ text: `Error: ${err}`, response_type: 'ephemeral' });
    }
};
