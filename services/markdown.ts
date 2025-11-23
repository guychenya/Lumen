import { marked } from 'marked';

// A simple sanitizer to prevent basic XSS while allowing required HTML tags.
// This is not a comprehensive XSS solution but is safer for this app's needs.
const sanitizeHtml = (html: string): string => {
    // Temporarily protect allowed complex tags (like video wrappers and details) 
    // so they are not affected by the simpler sanitization rules.
    const allowedComplexTags = /<(div|iframe|video|details|summary)[\s\S]*?>[\s\S]*?<\/\1>/gim;
    const placeholders: Record<string, string> = {};
    let sanitized = html.replace(allowedComplexTags, (match) => {
        const id = `__PROTECTED_BLOCK_${Math.random().toString(36).substring(2, 11)}__`;
        placeholders[id] = match;
        return id;
    });

    // Remove script tags and event handlers (e.g., onclick) from the rest of the HTML.
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/on\w+="[^"]*"/g, '');
    sanitized = sanitized.replace(/href="javascript:[^"]*"/g, '');

    // Restore the protected, safe-for-our-app HTML blocks.
    for (const id in placeholders) {
        sanitized = sanitized.replace(id, placeholders[id]);
    }

    return sanitized;
};


export const parseMarkdown = (text: string): string => {
  if (!text) return '';

  // Use the 'marked' library to reliably parse Markdown into HTML.
  const rawHtml = marked.parse(text, {
    gfm: true,        // Enable GitHub Flavored Markdown (for tables, etc.)
    breaks: true,     // Treat single newlines as <br> elements for easier typing.
    mangle: false,    // Do not obfuscate email addresses.
    headerIds: false  // Do not automatically generate IDs for headers.
  }) as string;

  // Run the sanitized HTML through our simple cleaner before rendering.
  return sanitizeHtml(rawHtml);
};
