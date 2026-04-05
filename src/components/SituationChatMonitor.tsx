import { useCallback, useEffect, useState } from 'react';
import { fetchSituationMessages, fetchSituationRooms, postSituationMessage } from '../api/client';

type RoomRow = { roomId?: string; title?: string; city?: string; lastActivityAt?: number };
type ChatMessage = {
  _id?: string;
  sender?: string;
  text?: string;
  timestamp?: number;
  imageUrl?: string;
};

const REVIEWER_SENDER = 'DPAL Review Node';

export function SituationChatMonitor(props: { readOnly?: boolean }) {
  const { readOnly } = props;
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadRooms = useCallback(async () => {
    setRoomError(null);
    setLoadingRooms(true);
    try {
      const raw = (await fetchSituationRooms()) as { ok?: boolean; rooms?: RoomRow[] };
      const list = Array.isArray(raw?.rooms) ? raw.rooms : [];
      setRooms(list);
      setSelectedRoomId((cur) => {
        if (cur && list.some((r) => r.roomId === cur)) return cur;
        return list[0]?.roomId ?? null;
      });
    } catch (e: unknown) {
      setRoomError(e instanceof Error ? e.message : String(e));
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const loadMessages = useCallback(async (roomId: string) => {
    setMsgError(null);
    setLoadingMsgs(true);
    try {
      const raw = (await fetchSituationMessages(roomId, 200)) as { ok?: boolean; messages?: ChatMessage[] };
      setMessages(Array.isArray(raw?.messages) ? raw.messages : []);
    } catch (e: unknown) {
      setMsgError(e instanceof Error ? e.message : String(e));
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!selectedRoomId) return;
    void loadMessages(selectedRoomId);
    const id = window.setInterval(() => {
      void loadMessages(selectedRoomId);
    }, 8000);
    return () => window.clearInterval(id);
  }, [selectedRoomId, loadMessages]);

  const send = async () => {
    if (readOnly || !selectedRoomId || !draft.trim() || sending) return;
    setSending(true);
    setMsgError(null);
    try {
      await postSituationMessage(selectedRoomId, {
        sender: REVIEWER_SENDER,
        text: draft.trim(),
      });
      setDraft('');
      await loadMessages(selectedRoomId);
    } catch (e: unknown) {
      setMsgError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(200px, 260px) 1fr', alignItems: 'start' }}>
      <div
        style={{
          border: '1px solid var(--graphite-border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-elevated)',
          padding: '0.75rem',
          maxHeight: '420px',
          overflow: 'auto',
        }}
      >
        <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
          <span className="section-title" style={{ margin: 0 }}>
            Situation rooms
          </span>
          <button type="button" className="btn" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }} onClick={() => void loadRooms()}>
            Refresh
          </button>
        </div>
        {loadingRooms && <p className="text-muted" style={{ fontSize: '0.75rem' }}>Loading…</p>}
        {roomError && (
          <p style={{ color: '#fca5a5', fontSize: '0.72rem', margin: '0.25rem 0' }} role="alert">
            {roomError}
          </p>
        )}
        {!loadingRooms && rooms.length === 0 && !roomError && (
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>
            No rooms yet. Set <span className="mono">DPAL_UPSTREAM_URL</span> on the reviewer API and open incident chats in the main DPAL app.
          </p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rooms.map((r) => {
            const id = r.roomId ?? '';
            const active = id === selectedRoomId;
            return (
              <li key={id || Math.random().toString(36)}>
                <button
                  type="button"
                  onClick={() => setSelectedRoomId(id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.5rem 0.45rem',
                    marginBottom: '0.25rem',
                    borderRadius: '6px',
                    border: active ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid transparent',
                    background: active ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                    color: 'var(--silver)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--white)' }}>{r.title || id || 'Room'}</div>
                  {r.city ? <div className="text-muted">{r.city}</div> : null}
                  <div className="mono text-muted" style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>
                    {id}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        style={{
          border: '1px solid var(--graphite-border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '420px',
          maxHeight: '560px',
        }}
      >
        <div style={{ padding: '0.65rem 0.85rem', borderBottom: '1px solid var(--graphite-border)' }}>
          <div className="section-title" style={{ margin: 0 }}>
            Live transcript
          </div>
          <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', lineHeight: 1.45 }}>
            Messages refresh every 8s. Post guidance or flags as the review node — visible to operatives in the situation room.
          </p>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loadingMsgs && <p className="text-muted" style={{ fontSize: '0.75rem' }}>Loading messages…</p>}
          {msgError && (
            <p style={{ color: '#fca5a5', fontSize: '0.72rem' }} role="alert">
              {msgError}
            </p>
          )}
          {!loadingMsgs &&
            messages.map((m, i) => {
              const isNode = (m.sender || '').includes('Review Node');
              return (
                <div
                  key={m._id || `${m.timestamp}-${i}`}
                  style={{
                    alignSelf: isNode ? 'flex-end' : 'flex-start',
                    maxWidth: '92%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '8px',
                    background: isNode ? 'rgba(212, 175, 55, 0.12)' : 'var(--bg-deep)',
                    border: `1px solid ${isNode ? 'rgba(212, 175, 55, 0.35)' : 'var(--graphite-border)'}`,
                  }}
                >
                  <div style={{ fontSize: '0.65rem', color: 'var(--gold)', marginBottom: '0.2rem' }}>
                    {m.sender || '—'} ·{' '}
                    {m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}
                  </div>
                  {m.text ? <div style={{ fontSize: '0.78rem', color: 'var(--silver)', whiteSpace: 'pre-wrap' }}>{m.text}</div> : null}
                  {m.imageUrl ? (
                    <img
                      src={m.imageUrl}
                      alt=""
                      style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '6px', marginTop: '0.35rem' }}
                    />
                  ) : null}
                </div>
              );
            })}
          {!loadingMsgs && selectedRoomId && messages.length === 0 && !msgError && (
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>No messages in this room yet.</p>
          )}
        </div>

        <div style={{ padding: '0.65rem 0.85rem', borderTop: '1px solid var(--graphite-border)' }}>
          {readOnly ? (
            <p className="text-muted" style={{ fontSize: '0.72rem', margin: 0 }}>
              Mock mode — connect the reviewer API to send messages.
            </p>
          ) : (
            <>
              <label className="section-title" style={{ display: 'block', marginBottom: '0.35rem' }}>
                Post as {REVIEWER_SENDER}
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!selectedRoomId || sending}
                rows={3}
                placeholder="Guidance, evidence request, or safety notice…"
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '0.5rem 0.65rem',
                  fontSize: '0.8rem',
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--graphite-border)',
                  borderRadius: '6px',
                  color: 'var(--silver)',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '0.5rem' }}
                disabled={!selectedRoomId || sending || !draft.trim()}
                onClick={() => void send()}
              >
                {sending ? 'Sending…' : 'Send to situation room'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
