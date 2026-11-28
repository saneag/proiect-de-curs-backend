import sanitizeHtml from 'sanitize-html';

import { PostDecorator } from '../controllers/Post/Decorator/PostDecorator';

// New posts are stored as sanitized HTML behind this marker. Older posts use the
// legacy marker syntax (**bold**, //italic//) and are converted when read.
export const POST_CONTENT_V2 = '<!--v2-->';

export const MAX_POST_TEXT_LENGTH = 1000;
const MAX_POST_HTML_LENGTH = 10000;

const sanitizeOptions: sanitizeHtml.IOptions = {
    allowedTags: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'blockquote',
        'ul',
        'ol',
        'li',
        'a',
    ],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
        // Only absolute web links keep an href; the rest lose it and are unwrapped below.
        a: (tagName, attribs) => {
            const href = (attribs.href ?? '').trim();
            const attributes: sanitizeHtml.Attributes = /^https?:\/\//i.test(
                href
            )
                ? { href }
                : {};
            return { tagName, attribs: attributes };
        },
    },
};

// Removes anchors without an href (and their closing tags), keeping their text.
const unwrapAnchorsWithoutHref = (html: string) => {
    const hasHref: boolean[] = [];
    return html.replace(/<a(\s[^>]*)?>|<\/a>/g, (tag) => {
        if (tag === '</a>') return hasHref.pop() ? tag : '';
        hasHref.push(tag !== '<a>');
        return tag !== '<a>' ? tag : '';
    });
};

// Visible length of post HTML: tags are removed and each entity counts as one character.
const visibleTextLength = (html: string) =>
    html.replace(/<[^>]*>/g, '').replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, '_')
        .length;

/**
 * Validates and sanitizes post HTML sent by a client.
 * Returns the value to store, or null when the input is not acceptable.
 */
export function preparePostContent(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > MAX_POST_HTML_LENGTH) {
        return null;
    }

    const clean = unwrapAnchorsWithoutHref(
        sanitizeHtml(value, sanitizeOptions)
    ).trim();
    const textLength = visibleTextLength(clean);

    if (textLength < 1 || textLength > MAX_POST_TEXT_LENGTH) {
        return null;
    }

    return POST_CONTENT_V2 + clean;
}

/** Converts stored content into the HTML sent to clients. */
export function renderPostContent(stored: string): string {
    return stored.startsWith(POST_CONTENT_V2)
        ? stored.slice(POST_CONTENT_V2.length)
        : new PostDecorator().simplifyText(stored);
}
