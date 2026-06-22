import { useEffect, useRef, useState } from 'react';
import { bus } from '../game/EventBus';

// Island chat: collapsible panel (bottom-left). Messages ride the same Supabase
// island channel as movement (see multiplayer.ts), so everyone on your island
// sees them. Closed by default — a 💬 button with an unread badge opens it.
type Msg = { id: number; name: string; text: string; self?: boolean };
let nextId = 0;
const MAX = 60;

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  openRef.current = open;

  useEffect(() => {
    return bus.on('mp:chat', ({ name, text }) => {
      setMsgs((m) => [...m, { id: nextId++, name, text }].slice(-MAX));
      if (!openRef.current) setUnread((u) => Math.min(99, u + 1));
    });
  }, []);

  // Keep the log scrolled to the newest line.
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs, open]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        setUnread(0);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return next;
    });
  };

  const send = () => {
    const t = text.trim().slice(0, 200);
    if (!t) return;
    bus.emit('mp:chatSend', { text: t });
    // Broadcast is self:false, so add our own line locally.
    setMsgs((m) => [...m, { id: nextId++, name: 'You', text: t, self: true }].slice(-MAX));
    setText('');
  };

  if (!open) {
    return (
      <button className="chat-toggle" onClick={toggle} title="Island chat">
        💬
        {unread > 0 && <span className="chat-unread">{unread}</span>}
      </button>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span>💬 Island Chat</span>
        <button className="chat-x" onClick={toggle} title="Close">✕</button>
      </div>
      <div className="chat-list" ref={listRef}>
        {msgs.length === 0 && <div className="chat-empty">Say hi to your island 👋</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`chat-msg${m.self ? ' is-self' : ''}`}>
            <span className="chat-name">{m.name}:</span> {m.text}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          value={text}
          maxLength={200}
          placeholder="Type a message…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); send(); }
            else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
          }}
        />
        <button className="chat-send" onClick={send}>Send</button>
      </div>
    </div>
  );
}
