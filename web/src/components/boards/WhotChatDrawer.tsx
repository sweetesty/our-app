import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../context/SessionProvider'

type ChatMessage = {
  id: string
  sender: string
  text: string
  time: string
}

type WhotChatDrawerProps = {
  open: boolean
  onClose: () => void
  matchId: string
  myName: string
  partnerName: string
}

const PRESET_CHIPS = [
  'Good luck 🍀',
  'Nice one 🔥',
  'Your move 👀',
  'Oops 😅',
  'GG 🤝',
  'Rematch? 🔄',
  'Guy PLAY nah 🏃',
  'Abii u dey mad ni 😂',
  'Check up soon! 🎉',
  'Oya market direct 🛒',
]

export default function WhotChatDrawer({
  open,
  onClose,
  matchId,
  myName,
  partnerName,
}: WhotChatDrawerProps) {
  const { coupleId, userId } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  /**
   * Read the thread, then keep it live.
   *
   * This used to be a realtime broadcast and nothing else — a pipe, not a
   * store. If you were not on this screen at that second the message had
   * never existed: leave the board and come back and it was gone, and there
   * was no row anywhere for a notification to be about. It is a table now
   * (0064_board_chat.sql), which fixes both at once.
   */
  const load = useCallback(async () => {
    if (!matchId) return
    const { data } = await supabase
      .from('board_chat')
      .select('id, body, author_id, created_at')
      .eq('match_id', matchId)
      .order('created_at')
      .limit(100)

    setMessages(
      ((data as { id: string; body: string; author_id: string; created_at: string }[]) ?? []).map(
        (m) => ({
          id: m.id,
          sender: m.author_id === userId ? myName : partnerName,
          text: m.body,
          time: new Date(m.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }),
      ),
    )
  }, [matchId, userId, myName, partnerName])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!matchId) return
    const channel = supabase
      .channel('board-chat-' + matchId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'board_chat',
          filter: 'match_id=eq.' + matchId,
        },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [matchId, load])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function sendText(text: string) {
    const body = text.trim()
    if (!body || !matchId || !coupleId || !userId) return
    setDraft('')

    // No optimistic copy: the insert comes straight back over realtime, and a
    // local one would sit there looking sent even when it was not.
    const { error } = await supabase.from('board_chat').insert({
      couple_id: coupleId,
      match_id: matchId,
      author_id: userId,
      body,
    })
    if (error) setDraft(body)
    else await load()
  }
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-t-[2.5rem] border-t border-rose-700/60 bg-rose-950 p-5 pb-8 text-white shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[75vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 -15px 40px rgba(0,0,0,0.85)',
        }}
      >
        {/* Grab bar */}
        <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-rose-700/50" />

        {/* Header */}
        <div className="flex items-start justify-between border-b border-rose-800/50 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <h2 className="text-sm font-black tracking-tight text-white">
                Table chat • 2 players
              </h2>
            </div>
            <p className="mt-0.5 text-[0.68rem] text-rose-300">
              Live with @{partnerName}; quick reactions and banter.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-full bg-rose-900/40 text-xs text-white/70 hover:bg-rose-700/50 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto py-3 space-y-2.5 min-h-[140px] max-h-[220px] scrollbar-none text-xs">
          {messages.map((m) => {
            const isMe = m.sender === myName
            const isSystem = m.sender === 'System'

            if (isSystem) {
              return (
                <div key={m.id} className="text-center text-[0.65rem] italic text-rose-400/70">
                  {m.text}
                </div>
              )
            }

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[0.65rem] font-bold text-rose-300/90 mb-0.5">
                  @{m.sender}
                </span>
                <div
                  className={`rounded-2xl px-3.5 py-1.5 max-w-[80%] font-medium ${
                    isMe
                      ? 'bg-gradient-to-br from-pink-600 to-rose-600 text-white font-bold'
                      : 'bg-rose-800/40 text-white'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Quick Reaction Chips (matching screenshot 4) */}
        <div className="py-2 border-t border-rose-800/50">
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
            {PRESET_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendText(chip)}
                className="shrink-0 rounded-full border border-rose-700/40 bg-rose-900/40 px-3 py-1 text-[0.7rem] font-bold text-rose-100 hover:bg-rose-900 transition active:scale-95"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            sendText(draft)
          }}
          className="flex items-center gap-2 pt-1"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the table…"
            className="flex-1 rounded-full border border-rose-700/40 bg-rose-950/60 px-4 py-2 text-xs text-rose-50 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-full bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-xs font-bold text-white hover:from-pink-500 disabled:opacity-40 transition"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
