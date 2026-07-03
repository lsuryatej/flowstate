// Markdown — renders the assistant's markdown output (headings, lists, code
// fences, tables, etc.) instead of dumping raw `###`/`**`/``` ``` as text.
// Styling lives in the scoped `.fs-md` block in index.css. Links open in the
// OS browser via the opener plugin — never navigate the webview away.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';

function Markdown({ children }: { children: string }) {
  return (
    <div className="fs-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) void openUrl(href);
              }}
            >
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
