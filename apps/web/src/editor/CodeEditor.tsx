import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { Messages } from '../i18n/messages';

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  theme: 'light' | 'dark';
  compileError: { message: string; logs: string } | null;
  t: Messages;
}

const MOBILE_SYMBOLS = ['{', '}', '(', ')', ';', '=', '//', '<', '>', '"', '#'];

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  theme,
  compileError,
  t,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Rebuild CodeMirror instance when theme changes; keep doc intact
  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const extensions = [
      basicSetup,
      cpp(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      ...(theme === 'dark' ? [oneDark] : []),
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally recreate only on theme swap; external doc sync handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Sync external sketch changes (template load / project load)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const insertSymbol = (sym: string) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: sym },
      selection: { anchor: sel.from + sym.length },
    });
    view.focus();
  };

  return (
    <div className="editor-container">
      <div ref={hostRef} className="cm-host" aria-label="Arduino C++ code editor" />
      {compileError && (
        <div className="compile-error-box" role="alert">
          <strong>
            {t.statusCompileError}: {compileError.message}
          </strong>
          <div>{t.compileErrorHint}</div>
          {compileError.logs && <pre>{compileError.logs}</pre>}
        </div>
      )}
      <div className="mobile-symbol-bar" role="toolbar" aria-label="C++ symbols">
        {MOBILE_SYMBOLS.map((sym) => (
          <button
            key={sym}
            type="button"
            className="symbol-key"
            onPointerDown={(e) => {
              // Keep virtual keyboard open on touch devices
              e.preventDefault();
              insertSymbol(sym);
            }}
            onClick={(e) => {
              // Support keyboard activation (Enter/Space)
              if (e.detail === 0) insertSymbol(sym);
            }}
          >
            {sym}
          </button>
        ))}
      </div>
    </div>
  );
};
