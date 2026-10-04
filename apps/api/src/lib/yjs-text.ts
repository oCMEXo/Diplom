import * as Y from "yjs";

/** The editor binds to the Yjs text named "monaco"; this builds a stored document that already holds `text`. */
export function textToYjsState(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText("monaco").insert(0, text);
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

/** The reverse of `textToYjsState`: the text of a stored editor document (empty when never edited). */
export function yjsStateToText(state: Uint8Array | null): string {
  if (!state) return "";
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  const text = doc.getText("monaco").toString();
  doc.destroy();
  return text;
}
