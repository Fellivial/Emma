const SEPARATORS = ["\n\n", "\n", " ", ""];

function merge(parts: string[], sep: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];
  const current: string[] = [];
  let len = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join(sep));
    while (current.length > 0 && len > chunkOverlap) {
      len -= current[0].length;
      current.shift();
    }
  };

  for (const part of parts) {
    const added = part.length + (current.length > 0 ? sep.length : 0);
    if (len + added > chunkSize && current.length > 0) flush();
    current.push(part);
    len += part.length + (current.length > 1 ? sep.length : 0);
  }
  if (current.length > 0) chunks.push(current.join(sep));
  return chunks;
}

function split(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  if (text.length <= chunkSize) return text.trim() ? [text] : [];

  const [sep, ...rest] = separators;
  if (sep === undefined) return text.trim() ? [text] : [];

  const parts = sep === "" ? [...text] : text.split(sep);

  const goodParts: string[] = [];
  for (const p of parts) {
    if (p.length > chunkSize && rest.length > 0) {
      goodParts.push(...split(p, rest, chunkSize, chunkOverlap));
    } else if (p.trim()) {
      goodParts.push(p);
    }
  }

  return merge(goodParts, sep, chunkSize, chunkOverlap);
}

/**
 * Splits text into overlapping chunks using a hierarchy of separators
 * (paragraphs → lines → words → characters), similar to LangChain's
 * RecursiveCharacterTextSplitter.
 */
export function recursiveCharacterSplit(
  text: string,
  chunkSize = 1000,
  chunkOverlap = 150
): string[] {
  return split(text, SEPARATORS, chunkSize, chunkOverlap).filter((c) => c.trim().length > 0);
}
