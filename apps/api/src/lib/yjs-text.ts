import * as Y from "yjs";

/** The editor binds to the Yjs text named "monaco"; this builds a stored document that already holds `text`. */
export function textToYjsState(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText("monaco").insert(0, text);
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}
