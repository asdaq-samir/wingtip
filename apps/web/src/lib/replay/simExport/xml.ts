/** An empty XML document in a namespace, the browser's own (DOM
 *  createDocument), which XMLSerializer then writes out escaped. */
export function xmlDocument(namespace: string, root: string): XMLDocument {
  return document.implementation.createDocument(namespace, root, null);
}

/** An element holding text, in a namespace. */
export function xmlText(doc: XMLDocument, namespace: string, name: string, text: string): Element {
  const el = doc.createElementNS(namespace, name);
  el.textContent = text;
  return el;
}
