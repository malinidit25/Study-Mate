import ReactMarkdown from "react-markdown";

// Turn [file.pdf, Page 3] citations into highlighted chips.
const citeRe = /\[([^\[\]]*?Page\s*\d+[^\[\]]*?)\](?!\()/gi;

export function Markdown({ children }: { children: string }) {
  const src = children.replace(citeRe, (_m, inner) => `[${inner}](#cite)`);
  return (
    <div className="study-prose">
      <ReactMarkdown
        components={{
          a: ({ href, children }) =>
            href === "#cite" ? (
              <span className="cite-chip">{children}</span>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
                {children}
              </a>
            ),
        }}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}
