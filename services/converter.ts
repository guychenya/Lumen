
import { parseMarkdown } from './markdown';

// Helper to convert HTML back to Markdown for export/storage
export const htmlToMarkdown = (html: string): string => {
  if (!html) return '';
  
  // Create a temporary DOM element to parse the HTML
  const div = document.createElement('div');
  div.innerHTML = html;

  let md = '';

  // Recursive function to traverse DOM
  const traverse = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      md += node.textContent;
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      switch (tagName) {
        case 'h1': md += `\n# ${el.textContent}\n`; break;
        case 'h2': md += `\n## ${el.textContent}\n`; break;
        case 'h3': md += `\n### ${el.textContent}\n`; break;
        case 'p': 
            traverseChildren(el); 
            md += '\n\n'; 
            break;
        case 'strong':
        case 'b':
            md += '**';
            traverseChildren(el);
            md += '**';
            break;
        case 'em':
        case 'i':
            md += '*';
            traverseChildren(el);
            md += '*';
            break;
        case 'ul':
            md += '\n';
            traverseChildren(el);
            md += '\n';
            break;
        case 'ol':
            md += '\n';
            traverseChildren(el);
            md += '\n';
            break;
        case 'li':
            md += '- ';
            traverseChildren(el);
            md += '\n';
            break;
        case 'blockquote':
            md += '\n> ';
            traverseChildren(el);
            md += '\n';
            break;
        case 'code':
            md += '`';
            traverseChildren(el);
            md += '`';
            break;
        case 'pre':
            md += '\n```\n' + el.textContent + '\n```\n';
            break;
        case 'img':
            const alt = el.getAttribute('alt') || 'image';
            const src = el.getAttribute('src') || '';
            md += `![${alt}](${src})`;
            break;
        case 'a':
            md += `[${el.textContent}](${el.getAttribute('href')})`;
            break;
        case 'hr':
            md += '\n---\n';
            break;
        case 'div':
            traverseChildren(el);
            md += '\n';
            break;
        case 'br':
            md += '\n';
            break;
        default:
            traverseChildren(el);
      }
    }
  };

  const traverseChildren = (parent: Element) => {
    parent.childNodes.forEach(child => traverse(child));
  };

  traverse(div);
  
  // Cleanup excessive newlines
  return md.replace(/\n\n\n+/g, '\n\n').trim();
};

export const markdownToHtml = (md: string): string => {
    return parseMarkdown(md);
};
