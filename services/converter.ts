
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
            // Check for checkbox
            const input = el.querySelector('input[type="checkbox"]');
            if (input) {
                const checked = (input as HTMLInputElement).checked;
                const text = el.textContent?.trim() || '';
                md += checked ? `[x] ${text}\n` : `[ ] ${text}\n`;
            } else {
                md += '- ';
                traverseChildren(el);
                md += '\n';
            }
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
        case 'iframe':
            // Preserve YouTube/Embed iframes
            md += `\n${el.outerHTML}\n`;
            break;
        case 'video':
            // Preserve video tags
            md += `\n${el.outerHTML}\n`;
            break;
        case 'hr':
            md += '\n---\n';
            break;
        case 'div':
            // Detect our custom video wrapper and preserve it whole
            if (el.classList.contains('aspect-video')) {
                md += `\n${el.outerHTML}\n`;
            } else {
                traverseChildren(el);
                md += '\n';
            }
            break;
        case 'details':
            // Preserve collapsible blocks structure but process children
            const openTag = el.outerHTML.split('>')[0] + '>';
            md += `\n${openTag}\n`;
            traverseChildren(el);
            md += `\n</details>\n`;
            break;
        case 'summary':
            const summaryOpen = el.outerHTML.split('>')[0] + '>';
            md += `\n${summaryOpen}`;
            traverseChildren(el);
            md += `</summary>\n`;
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

export const htmlToText = (html: string): string => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    // Helper to replace <br> and blocks with newlines before extracting text
    const replaceWithNewline = (tagName: string) => {
        const els = temp.getElementsByTagName(tagName);
        for (let i = els.length - 1; i >= 0; i--) {
            const el = els[i];
            el.parentNode?.insertBefore(document.createTextNode('\n'), el);
            el.parentNode?.insertBefore(document.createTextNode('\n'), el.nextSibling);
        }
    };
    
    replaceWithNewline('p');
    replaceWithNewline('div');
    replaceWithNewline('br');
    replaceWithNewline('li');
    
    return (temp.textContent || temp.innerText || '').replace(/\n\s*\n/g, '\n\n').trim();
};