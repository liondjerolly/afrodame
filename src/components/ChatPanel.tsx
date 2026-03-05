import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Send, Wifi, WifiOff, X } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const QUICK_MESSAGES = [
  { label: '👏', msg: 'Bien joué !' },
  { label: '🔥', msg: 'Très bon coup.' },
  { label: '💪', msg: 'Je reste concentré.' },
  { label: '🤝', msg: 'Bonne partie.' },
  { label: '⚡', msg: 'À toi de jouer.' },
];

export default function ChatPanel() {
  const {
    chatMessages,
    addChatMessage,
    toggleChat,
    currentUser,
    gameState,
    chatReadOnlyReason,
  } = useGameStore();

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mode = gameState?.mode;
  const isOnline = mode === 'online' || mode === 'challenge';
  const readOnlyReason =
    chatReadOnlyReason ||
    (isOnline && gameState?.gameOver ? 'Le chat est en lecture seule: la partie est terminée.' : null);
  const isReadOnly = Boolean(readOnlyReason);
  const myId = currentUser?.id || 'me';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  useEffect(() => () => {
    if (typingTimeout) clearTimeout(typingTimeout);
  }, [typingTimeout]);

  const simulateOpponentTyping = () => {
    if (!isOnline || isReadOnly) return;
    if (Math.random() < 0.4) {
      setTimeout(() => {
        setIsTyping(true);
        const timeout = setTimeout(() => setIsTyping(false), 1500 + Math.random() * 1500);
        setTypingTimeout(timeout);
      }, 700 + Math.random() * 1200);
    }
  };

  const send = () => {
    if (isReadOnly) return;
    const text = input.trim();
    if (!text) return;
    addChatMessage(text);
    simulateOpponentTyping();
    setInput('');
    inputRef.current?.focus();
  };

  const sendQuick = (msg: string) => {
    if (isReadOnly) return;
    addChatMessage(msg);
    simulateOpponentTyping();
  };

  const grouped = chatMessages.reduce((acc: typeof chatMessages[], msg, index) => {
    const prev = chatMessages[index - 1];
    if (prev && prev.senderId === msg.senderId) {
      acc[acc.length - 1] = [...acc[acc.length - 1], msg];
    } else {
      acc.push([msg]);
    }
    return acc;
  }, []);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed right-0 top-0 bottom-0 w-80 sm:w-96 glass-dark border-l border-white/10 flex flex-col z-40 shadow-2xl shadow-black/50"
    >
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-yellow-400" />
          <span className="font-semibold text-white">Chat</span>
          <span className="text-white/40 text-xs">— {gameState?.opponentName || 'Adversaire'}</span>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <div className="flex items-center gap-1 text-green-400/70 text-xs">
              <Wifi size={11} />
              <span>En ligne</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-white/30 text-xs">
              <WifiOff size={11} />
              <span>Local</span>
            </div>
          )}
          <button
            onClick={toggleChat}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 p-2.5 border-b border-white/5 overflow-x-auto bg-black/10">
        {QUICK_MESSAGES.map((q) => (
          <button
            key={q.label}
            onClick={() => sendQuick(q.msg)}
            title={q.msg}
            disabled={isReadOnly}
            className="shrink-0 px-2.5 py-1.5 bg-white/5 hover:bg-yellow-500/15 border border-white/10 rounded-xl text-sm transition-all text-white/70 disabled:opacity-40"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {chatMessages.length === 0 && (
          <div className="text-center text-white/30 text-sm mt-12">
            <MessageCircle size={36} className="mx-auto mb-3 opacity-20" />
            <p className="font-semibold">Aucun message</p>
            <p className="text-xs mt-1 text-white/20">
              {readOnlyReason || (isOnline ? 'Discutez avec votre adversaire.' : 'Vous pouvez envoyer un message.')}
            </p>
          </div>
        )}

        {grouped.map((group, groupIndex) => {
          const isMine = group[0].senderId === myId;
          return (
            <div key={groupIndex} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} mb-2`}>
              <span className="text-white/30 text-xs mb-1 px-1">{group[0].senderName}</span>
              <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} gap-0.5`}>
                {group.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: isMine ? 20 : -20, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 20, delay: index * 0.05 }}
                    className={`max-w-[85%] px-3 py-2 text-sm text-white ${isMine ? 'chat-bubble-own' : 'chat-bubble-other'}`}
                  >
                    {msg.content}
                  </motion.div>
                ))}
              </div>
              <span className="text-white/20 text-xs mt-0.5 px-1">
                {group[group.length - 1].timestamp.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        })}

        <AnimatePresence>
          {isTyping && !isReadOnly && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-start gap-2"
            >
              <span className="text-white/30 text-xs px-1">{gameState?.opponentName || 'Adversaire'}</span>
              <div className="chat-bubble-other px-3 py-2 flex items-center gap-1">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-white/10 bg-black/20">
        {isOnline && (
          <div className="flex items-center gap-1.5 text-xs text-white/25 mb-2">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span>Chat en temps réel</span>
          </div>
        )}
        {readOnlyReason && (
          <div className="mb-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-300">
            {readOnlyReason}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={isReadOnly ? 'Lecture seule' : 'Votre message...'}
            maxLength={200}
            disabled={isReadOnly}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-yellow-500/40 transition-colors disabled:opacity-50"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={send}
            disabled={!input.trim() || isReadOnly}
            className="p-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl text-black transition-colors shadow-lg shadow-yellow-500/20"
          >
            <Send size={16} />
          </motion.button>
        </div>
        {input.length > 150 && (
          <p className="text-white/30 text-xs mt-1 text-right">{200 - input.length} caractères restants</p>
        )}
      </div>
    </motion.div>
  );
}
