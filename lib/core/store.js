// Document store with undo/redo and a local draft (autosave in this browser only).
//
// The document is mutated in place while typing. commit() records a history step when the
// document differs from the last committed state (call it on `change`, after structural edits).

export class DocumentStore {
  constructor(doc, { draftKey = null, limit = 200 } = {}) {
    this.doc = doc;
    this.draftKey = draftKey;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.committed = JSON.stringify(doc);
    this.draftTimer = null;
  }

  commit() {
    const s = JSON.stringify(this.doc);
    if (s === this.committed) return false;
    this.undoStack.push(this.committed);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.committed = s;
    this.redoStack.length = 0;
    this.writeDraft(s);
    return true;
  }

  /** Replace the whole document (open file, new, example). Undoable. */
  replace(doc) {
    this.commit();
    this.doc = doc;
    this.commit();
  }

  undo() {
    this.commit();
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.committed);
    this.committed = this.undoStack.pop();
    this.doc = JSON.parse(this.committed);
    this.writeDraft(this.committed);
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.committed);
    this.committed = this.redoStack.pop();
    this.doc = JSON.parse(this.committed);
    this.writeDraft(this.committed);
    return true;
  }

  get canUndo() {
    return this.undoStack.length > 0 || JSON.stringify(this.doc) !== this.committed;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Save the draft soon (used while typing, without a history step). */
  touch() {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.writeDraft(JSON.stringify(this.doc)), 400);
  }

  writeDraft(s) {
    if (!this.draftKey) return;
    clearTimeout(this.draftTimer);
    try {
      localStorage.setItem(this.draftKey, s);
    } catch {
      /* storage blocked or full: the draft is a convenience only */
    }
  }

  static readDraft(key) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }
}
