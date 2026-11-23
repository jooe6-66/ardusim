import React, { useEffect, useRef, useState } from 'react';
import { Messages } from '../i18n/messages';

interface SerialMonitorProps {
  output: string;
  running: boolean;
  fullPane?: boolean;
  boardTag?: string;
  onClear: () => void;
  onSend: (text: string) => void;
  t: Messages;
}

export const SerialMonitor: React.FC<SerialMonitorProps> = ({
  output,
  running,
  fullPane = false,
  boardTag,
  onClear,
  onSend,
  t,
}) => {
  const [input, setInput] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (autoscroll && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output, autoscroll]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    onSend(`${input}\n`);
    setInput('');
  };

  return (
    <section className={`serial-panel ${fullPane ? 'full-pane' : ''}`} aria-label={t.serialTitle}>
      <div className="panel-header">
        <span>
          {t.serialTitle}
          {boardTag ? ` (${boardTag})` : ' (9600 baud)'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
            />
            {t.serialAutoscroll}
          </label>
          <button type="button" className="btn btn-compact" onClick={onClear}>
            {t.serialClear}
          </button>
        </div>
      </div>

      <pre ref={preRef} className="serial-output">
        {output ? (
          output
        ) : (
          <span className="serial-empty">
            {running ? t.serialEmptyRunning : t.serialEmptyIdle}
          </span>
        )}
      </pre>

      <form className="serial-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="text-input"
          placeholder={t.serialInputPlaceholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!running}
        />
        <button type="submit" className="btn btn-primary" disabled={!running || !input}>
          {t.serialSend}
        </button>
      </form>
    </section>
  );
};
