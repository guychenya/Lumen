

export const parseMarkdown = (text: string): string => {
  if (!text) return '';

  let html = text;
  const references: Record<string, string> = {};

  // 1. Extract Reference Definitions: [id]: url
  // This regex matches definitions starting at a new line.
  // We remove them from the visual output so they don't clutter the preview.
  html = html.replace(/^\[([^\]]+)\]:\s*(\S+).*$/gm, (match, id, url) => {
      references[id.toLowerCase()] = url;
      return ''; // Eat the definition from the output
  });

  // 2. Basic sanitization (prevent script/onclick but allow structural HTML)
  // We'll temporarily protect known safe complex tags (iframe, video, details, and their wrappers)
  
  // Protect Videos/Iframes and their wrappers
  const protectionRegex = /(<div class="aspect-video[^"]*">[\s\S]*?(?:<iframe|<video)[\s\S]*?(?:<\/iframe>|<\/video>)[\s\S]*?<\/div>|<iframe[\s\S]*?<\/iframe>|<video[\s\S]*?<\/video>|<details[\s\S]*?<\/details>)/gim;
  
  const replacements: { id: string, val: string }[] = [];
  
  html = html.replace(protectionRegex, (match) => {
      const id = `__MEDIA_${Math.random().toString(36).substr(2, 9)}__`;
      replacements.push({ id, val: match });
      return id;
  });

  // Standard Sanitize
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Restore Protected Media
  replacements.forEach(rep => {
      html = html.replace(rep.id, rep.val);
  });

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-4 mb-2 text-emerald-400">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-6 mb-3 text-emerald-500">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4 text-emerald-600">$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');

  // Images: ![alt](url) - Inline Style
  html = html.replace(/!\[([^\]]*)\]\(([^)]*)\)/gim, '<img src="$2" alt="$1" class="rounded-lg max-w-full my-4 border border-[#333]" />');

  // Images: ![alt][id] - Reference Style
  html = html.replace(/!\[([^\]]*)\]\[([^\]]*)\]/gim, (match, alt, id) => {
      const url = references[id.toLowerCase()];
      if (url) {
          return `<img src="${url}" alt="${alt}" class="rounded-lg max-w-full my-4 border border-[#333]" />`;
      }
      return match; // Return original string if ref not found
  });

  // Links: [text](url) - Inline Style
  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">$1</a>');

  // Links: [text][id] - Reference Style
  html = html.replace(/\[([^\]]+)\]\[([^\]]*)\]/gim, (match, text, id) => {
       const url = references[id.toLowerCase()];
       if (url) {
           return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">${text}</a>`;
       }
       return match;
  });

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-emerald-500 pl-4 py-1 my-4 text-gray-400 italic bg-[#1A1A1A] rounded-r">$1</blockquote>');

  // Horizontal Rules
  html = html.replace(/^---$/gim, '<hr class="border-[#333] my-6" />');

  // Lists (Bullet)
  html = html.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc marker:text-emerald-500">$1</li>');
  
  // Lists (Checkboxes)
  html = html.replace(/^\[ \] (.*$)/gim, '<li class="flex items-center gap-2"><input type="checkbox" disabled class="mr-2 accent-emerald-500 h-4 w-4 rounded border-gray-600 bg-[#222]"> <span class="text-gray-300">$1</span></li>');
  html = html.replace(/^\[x\] (.*$)/gim, '<li class="flex items-center gap-2"><input type="checkbox" checked disabled class="mr-2 accent-emerald-500 h-4 w-4 rounded border-gray-600 bg-[#222]"> <span class="text-gray-500 line-through">$1</span></li>');

  // Wrap consecutive lis in ul
  html = html.replace(/((<li.*>.*<\/li>\n?)+)/gim, '<ul class="my-4 space-y-1">$1</ul>');

  // Code Blocks
  html = html.replace(/```([\s\S]*?)```/gim, '<pre class="bg-[#1A1A1A] p-4 rounded-lg border border-[#333] overflow-x-auto my-4 font-mono text-sm text-gray-300">$1</pre>');

  // Inline Code
  html = html.replace(/`([^`]+)`/gim, '<code class="bg-[#222] px-1.5 py-0.5 rounded text-emerald-300 font-mono text-sm">$1</code>');

  // Tables
  const tableRegex = /\|(.+)\|\n\|[-| ]+\|\n((?:\|.*\|\n?)+)/g;
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
      const headers = headerRow.split('|').filter((c: string) => c.trim()).map((c: string) => `<th class="px-4 py-2 border border-[#333] bg-[#1A1A1A] text-left font-semibold text-emerald-500">${c.trim()}</th>`).join('');
      const rows = bodyRows.trim().split('\n').map((row: string) => {
          const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td class="px-4 py-2 border border-[#333] text-gray-300">${c.trim()}</td>`).join('');
          return `<tr>${cells}</tr>`;
      }).join('');
      
      return `<div class="overflow-x-auto my-6 rounded-lg border border-[#333]"><table class="w-full text-sm border-collapse"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });

  // Paragraphs
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.match(/^<(div|ul|li|h|p|blockquote|pre|table|hr|details|summary)/i)) return trimmed; 
      return `<p class="mb-4">${trimmed}</p>`;
  });
  
  html = processedLines.join('\n');

  return html;
};
