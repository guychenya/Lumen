
export const parseMarkdown = (text: string): string => {
  if (!text) return '';

  // Sanitize input to prevent basic XSS (simplified)
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-4 mb-2 text-emerald-400">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-6 mb-3 text-emerald-500">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4 text-emerald-600">$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');

  // Images: ![alt](url)
  html = html.replace(/!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" class="rounded-lg max-w-full my-4 border border-[#333]" />');

  // Links: [text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">$1</a>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-emerald-500 pl-4 py-1 my-4 text-gray-400 italic bg-[#1A1A1A] rounded-r">$1</blockquote>');

  // Horizontal Rules
  html = html.replace(/^---$/gim, '<hr class="border-[#333] my-6" />');

  // Lists (Bullet)
  html = html.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc marker:text-emerald-500">$1</li>');
  // Wrap consecutive lis in ul (simple regex approach)
  html = html.replace(/((<li.*>.*<\/li>\n?)+)/gim, '<ul class="my-4 space-y-1">$1</ul>');

  // Code Blocks
  html = html.replace(/```([\s\S]*?)```/gim, '<pre class="bg-[#1A1A1A] p-4 rounded-lg border border-[#333] overflow-x-auto my-4 font-mono text-sm text-gray-300">$1</pre>');

  // Inline Code
  html = html.replace(/`([^`]+)`/gim, '<code class="bg-[#222] px-1.5 py-0.5 rounded text-emerald-300 font-mono text-sm">$1</code>');

  // Tables
  // Detect table structure: | Col | Col | ...
  const tableRegex = /\|(.+)\|\n\|[-| ]+\|\n((?:\|.*\|\n?)+)/g;
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
      const headers = headerRow.split('|').filter((c: string) => c.trim()).map((c: string) => `<th class="px-4 py-2 border border-[#333] bg-[#1A1A1A] text-left font-semibold text-emerald-500">${c.trim()}</th>`).join('');
      const rows = bodyRows.trim().split('\n').map((row: string) => {
          const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td class="px-4 py-2 border border-[#333] text-gray-300">${c.trim()}</td>`).join('');
          return `<tr>${cells}</tr>`;
      }).join('');
      
      return `<div class="overflow-x-auto my-6 rounded-lg border border-[#333]"><table class="w-full text-sm border-collapse"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });

  // Paragraphs (newlines to <br> or <p>)
  // Simple logic: double newline is new paragraph
  html = html.replace(/\n\n/g, '</p><p class="mb-4">');
  // Wrap content in initial p if not starting with block level
  if (!html.startsWith('<')) {
      html = '<p class="mb-4">' + html + '</p>';
  }

  // HTML Colors (from slash command)
  // We allow spans with style color
  html = html.replace(/&lt;span style="color:(.*?)"&gt;(.*?)&lt;\/span&gt;/gim, '<span style="color:$1">$2</span>');

  return html;
};
