"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonacoBinding = void 0;
/**
 * A simple binding between Yjs and Monaco Editor
 * This is a simplified version that provides basic collaborative editing
 */
class MonacoBinding {
    constructor(ytext, model, editors, awareness) {
        this._disposables = [];
        this._ignoreChanges = false;
        this.ytext = ytext;
        this.model = model;
        this.editor = Array.from(editors)[0];
        // Set initial content from Yjs
        if (ytext.toString()) {
            this._ignoreChanges = true;
            this.model.setValue(ytext.toString());
            this._ignoreChanges = false;
        }
        // Listen to Monaco changes
        this._disposables.push(this.model.onDidChangeContent((event) => {
            if (this._ignoreChanges)
                return;
            this._ignoreChanges = true;
            this.ytext.doc?.transact(() => {
                event.changes
                    .sort((a, b) => b.rangeOffset - a.rangeOffset)
                    .forEach((change) => {
                    // Delete old text
                    if (change.rangeLength > 0) {
                        this.ytext.delete(change.rangeOffset, change.rangeLength);
                    }
                    // Insert new text
                    if (change.text) {
                        this.ytext.insert(change.rangeOffset, change.text);
                    }
                });
            });
            this._ignoreChanges = false;
        }));
        // Listen to Yjs changes
        this.ytext.observe((event) => {
            if (this._ignoreChanges)
                return;
            this._ignoreChanges = true;
            const edits = event.changes.delta
                .map((delta, index) => {
                const pos = this.indexToPosition(event.changes.delta.slice(0, index));
                if (delta.retain) {
                    return null;
                }
                if (delta.delete) {
                    const endPos = this.offsetPosition(pos, delta.delete);
                    return {
                        range: {
                            startLineNumber: pos.lineNumber,
                            startColumn: pos.column,
                            endLineNumber: endPos.lineNumber,
                            endColumn: endPos.column,
                        },
                        text: '',
                    };
                }
                if (delta.insert) {
                    return {
                        range: {
                            startLineNumber: pos.lineNumber,
                            startColumn: pos.column,
                            endLineNumber: pos.lineNumber,
                            endColumn: pos.column,
                        },
                        text: delta.insert,
                    };
                }
                return null;
            })
                .filter((edit) => edit !== null);
            this.model.applyEdits(edits);
            this._ignoreChanges = false;
        });
    }
    indexToPosition(delta) {
        let index = 0;
        delta.forEach((d) => {
            if (d.retain)
                index += d.retain;
            if (d.insert)
                index += d.insert.length;
        });
        const text = this.model.getValue();
        let line = 1;
        let column = 1;
        for (let i = 0; i < index && i < text.length; i++) {
            if (text[i] === '\n') {
                line++;
                column = 1;
            }
            else {
                column++;
            }
        }
        return { lineNumber: line, column };
    }
    offsetPosition(pos, offset) {
        const text = this.model.getValue();
        const lines = text.split('\n');
        let currentLine = pos.lineNumber - 1;
        let currentColumn = pos.column - 1;
        let remaining = offset;
        while (remaining > 0 && currentLine < lines.length) {
            const lineLength = lines[currentLine].length;
            const charsInLine = lineLength - currentColumn;
            if (remaining <= charsInLine) {
                currentColumn += remaining;
                remaining = 0;
            }
            else {
                remaining -= charsInLine + 1; // +1 for newline
                currentLine++;
                currentColumn = 0;
            }
        }
        return {
            lineNumber: currentLine + 1,
            column: currentColumn + 1,
        };
    }
    destroy() {
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.MonacoBinding = MonacoBinding;
