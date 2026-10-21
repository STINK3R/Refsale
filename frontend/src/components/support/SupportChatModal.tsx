import { useState, useEffect, useRef } from 'react';
import Meerkat from '../mascot/Meerkat';
import { m, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, ChevronLeft, Plus, Package, Check, HelpCircle } from 'lucide-react';
import { useAuthStore, useAppStore, usePromoStore } from '../../store';
import { unescapeHtml } from '../../utils/format';
import { useSupportStore } from '../../store/support';
import ImageUploader from '../ui/ImageUploader';
import NotifyPrompt from '../ui/NotifyPrompt';
import AttachedImages from '../ui/AttachedImages';
import {
  createSupportTicket,
  fetchUserTickets,
  fetchTicketMessages,
  sendTicketMessage,
} from '../../api/client';
import type { SupportTicket, SupportMessage, Product } from '../../types';
import useScrollLock from '../../hooks/useScrollLock';

/**
 * Unified support chat modal — single source of truth for both the main-page
 * "Написать запрос" CTA (SupportSection) and the floating bubble
 * (SupportWidget). Centered, auto-height (with a max-height cap) so the
 * new-ticket form doesn't leave a big empty strip below the Send button.
 */
export default function SupportChatModal() {
  const { user } = useAuthStore();
  const { isOpen, startInNew, close, prefillSubject, prefillText, prefillProductId, showProductPicker, ticketId } = useSupportStore();
  const products = useAppStore((s) => s.products);

  useScrollLock(isOpen);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // New ticket form
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [guestName, setGuestName] = useState(() => {
    try { return localStorage.getItem('support_guest_name') || ''; } catch { return ''; }
  });
  // Product-topic picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Message input
  const [msgText, setMsgText] = useState('');
  const [msgImages, setMsgImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // On open: load the user's tickets (if logged in) or go straight to new-ticket
  // form (guests / explicit trigger).
  useEffect(() => {
    if (!isOpen) {
      setActiveTicket(null);
      setShowNew(false);
      setMessages([]);
      setSelectedProduct(null);
      setPickerOpen(false);
      setPickerQuery('');
      return;
    }

    // Apply prefill from store (subject / text / product)
    if (prefillSubject) setSubject(prefillSubject);
    if (prefillText) setText(prefillText);
    if (prefillProductId != null) {
      const p = products.find(pp => pp.id === prefillProductId) || null;
      setSelectedProduct(p);
      if (p && !prefillSubject) setSubject(`Вопрос по товару: ${p.name}`);
    }
    setPickerOpen(!!showProductPicker);

    if (!user) {
      setShowNew(true);
      return;
    }
    if (startInNew) {
      setShowNew(true);
    } else {
      setShowNew(false);
    }
    setLoading(true);
    fetchUserTickets(user.id)
      .then(t => {
        setTickets(t);
        const wanted = ticketId ? t.find(x => x.id === ticketId) : null;
        if (wanted) void openTicket(wanted);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user, startInNew, prefillSubject, prefillText, prefillProductId, showProductPicker, ticketId]);

  useEffect(() => {
    if (activeTicket) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTicket]);

  const openTicket = async (ticket: SupportTicket) => {
    setActiveTicket(ticket);
    setLoading(true);
    try {
      const msgs = await fetchTicketMessages(ticket.id);
      setMessages(msgs);
    } catch { setMessages([]); }
    setLoading(false);
  };

  const handleCreateTicket = async () => {
    const senderName = user ? user.full_name : guestName.trim();
    if (!senderName || !subject.trim() || !text.trim()) return;
    if (!user) {
      try { localStorage.setItem('support_guest_name', guestName.trim()); } catch {
        /* ignore */
      }
    }
    // If user selected a product as topic, prepend structured info to the message
    // so admin sees which product the question relates to.
    const finalSubject = selectedProduct
      ? (subject.trim().startsWith('Вопрос по товару')
          ? subject.trim()
          : `Вопрос по товару: ${selectedProduct.name}`)
      : subject.trim();
    const finalText = selectedProduct
      ? `[Товар: ${selectedProduct.name}${selectedProduct.price ? `, ${selectedProduct.price}₽` : ''}]\n\n${text.trim()}`
      : text.trim();
    setLoading(true);
    try {
      await createSupportTicket({
        user_id: user?.id || 0,
        user_name: senderName,
        subject: finalSubject,
        text: finalText,
        // Marks this as a "Связь с продавцом" enquiry, which is members-only.
        product_id: selectedProduct?.id ?? null,
        images: newImages,
        // The leader whose code the buyer came with sees this conversation.
        promo_code: usePromoStore.getState().code,
      });
      setSubject('');
      setText('');
      setNewImages([]);
      setSelectedProduct(null);
      setPickerOpen(false);
      setPickerQuery('');
      setShowNew(false);
      if (user) {
        const updated = await fetchUserTickets(user.id);
        setTickets(updated);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleSendMessage = async () => {
    if (!activeTicket) return;
    if (!msgText.trim() && !msgImages.length) return;
    const senderName = user ? user.full_name : guestName.trim();
    if (!senderName) return;
    try {
      const msg = await sendTicketMessage(activeTicket.id, {
        sender_type: 'user',
        sender_name: senderName,
        text: msgText.trim(),
        images: msgImages,
      }) as SupportMessage;
      setMessages(prev => [...prev, msg]);
      setMsgText('');
      setMsgImages([]);
    } catch { /* ignore */ }
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    open: { text: 'Открыт', color: 'bg-primary/20 text-primary' },
    in_progress: { text: 'В работе', color: 'bg-yellow-500/20 text-yellow-600' },
    closed: { text: 'Закрыт', color: 'bg-surface text-muted' },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/45 z-[3000] backdrop-blur-sm"
            onClick={close}
          />
          <m.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            // Centered, auto-height modal — caps at 640px or 85vh so tall content
            // still scrolls, but short content (like the new-ticket form) doesn't
            // leave empty space below the Send button.
            className="fixed inset-0 z-[3100] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-lg bg-bg border-2 border-ink sm:rounded-[24px] overflow-hidden flex flex-col"
              style={{ height: '100dvh', maxHeight: 'min(640px, 100dvh)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-3 bg-sun border-b-2 border-ink text-ink shrink-0">
                {activeTicket && (
                  <button
                    onClick={() => { setActiveTicket(null); setMessages([]); }}
                    className="w-7 h-7 rounded-ctl-xs bg-ink/20 flex items-center justify-center hover:bg-ink/30 transition cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                )}
                {!activeTicket && <Meerkat pose="phone" width={40} decorative className="-my-1" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] truncate">
                    {activeTicket ? unescapeHtml(activeTicket.subject) : 'Чаты с продавцом'}
                  </div>
                  {!activeTicket && (
                    <div className="text-[11px] opacity-80">Спросите о товаре, наличии или доставке</div>
                  )}
                </div>
                <button
                  onClick={close}
                  className="w-7 h-7 rounded-ctl-xs bg-ink/20 flex items-center justify-center hover:bg-ink/30 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
                {activeTicket ? (
                  <div className="p-4 space-y-3">
                    {activeTicket.status !== 'closed' && <NotifyPrompt />}
                    {loading ? (
                      <div className="text-center text-muted py-8 text-sm">Загрузка...</div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-muted py-8 text-sm">Нет сообщений</div>
                    ) : (
                      messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] px-3.5 py-2 text-[13px] leading-relaxed ${
                            msg.sender_type === 'user'
                              ? 'bg-primary text-ink rounded-br-sm'
                              : 'bg-surface text-text rounded-bl-sm'
                          }`}>
                            {msg.sender_type !== 'user' && (
                              <div className="text-[10px] font-bold mb-0.5 text-primary">{msg.sender_type === 'leader' ? `${msg.sender_name} · лидер мнений` : 'Продавец'}</div>
                            )}
                            <span className="whitespace-pre-line">{unescapeHtml(msg.text)}</span>
                            <AttachedImages images={msg.images} size="sm" className="mt-1.5" />
                            <div className="text-[9px] mt-1 text-light">
                              {new Date(msg.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                ) : showNew ? (
                  // Compact new-ticket form — natural height so modal doesn't
                  // stretch to fill all vertical space.
                  <div className="p-4 space-y-2.5">
                    {!user && (
                      <div>
                        <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-1">Ваше имя</label>
                        <input
                          type="text"
                          placeholder="Как к вам обращаться"
                          value={guestName}
                          onChange={e => setGuestName(e.target.value)}
                          maxLength={30}
                          className="field"
                        />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Тема</label>
                        {!selectedProduct && (
                          <button
                            type="button"
                            onClick={() => setPickerOpen(v => !v)}
                            className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Package size={12} /> {pickerOpen ? 'Скрыть товары' : 'Выбрать товар (необязательно)'}
                          </button>
                        )}
                      </div>

                      {selectedProduct ? (
                        <div className="mb-2 flex items-center gap-2.5 p-2 pr-2.5 border border-primary/30 bg-primary/5">
                          <div className="w-10 h-10 overflow-hidden bg-card border border-border flex-shrink-0">
                            {selectedProduct.image_url ? (
                              <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted">
                                <Package size={16} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-bold text-text truncate">{selectedProduct.name}</div>
                            {selectedProduct.price != null && (
                              <div className="text-[11px] text-muted">{selectedProduct.price}₽</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedProduct(null); setSubject(''); }}
                            aria-label="Убрать товар"
                            className="w-6 h-6 rounded-full bg-card border border-border text-muted hover:text-danger hover:border-danger transition flex items-center justify-center cursor-pointer flex-shrink-0"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : pickerOpen && (
                        <div className="mb-2 border border-border bg-surface/40 p-2.5">
                          <input
                            type="text"
                            placeholder="Поиск товара..."
                            value={pickerQuery}
                            onChange={e => setPickerQuery(e.target.value)}
                            className="w-full px-3 py-2 mb-2 border border-border text-[13px] bg-card focus:outline-none focus:border-primary"
                          />
                          <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 [scrollbar-width:thin]">
                            {/* "Иная тема" as first card in product list */}
                            <button
                              type="button"
                              onClick={() => {
                                setSubject('Иная тема');
                                setPickerOpen(false);
                              }}
                              className="flex-shrink-0 w-[108px] bg-primary/5 border-2 border-primary/25 hover:border-primary/50 hover:shadow-md transition p-1.5 text-left cursor-pointer"
                            >
                              <div className="w-full h-16 bg-primary/10 flex items-center justify-center mb-1">
                                <HelpCircle size={24} className="text-primary" />
                              </div>
                              <div className="text-[11px] font-bold text-text leading-tight line-clamp-2">Иная тема</div>
                              <div className="text-[10px] text-muted mt-0.5">без привязки</div>
                            </button>
                            {(products || [])
                              .filter(p => {
                                if (!pickerQuery.trim()) return true;
                                const q = pickerQuery.toLowerCase();
                                return p.name.toLowerCase().includes(q);
                              })
                              .slice(0, 30)
                              .map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedProduct(p);
                                    setSubject(`Вопрос по товару: ${p.name}`);
                                    setPickerOpen(false);
                                    setPickerQuery('');
                                  }}
                                  className="flex-shrink-0 w-[108px] bg-card border border-border hover:border-primary hover:shadow-md transition p-1.5 text-left cursor-pointer"
                                >
                                  <div className="w-full h-16 overflow-hidden bg-surface mb-1">
                                    {p.image_url ? (
                                      <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-muted">
                                        <Package size={20} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-bold text-text leading-tight line-clamp-2">{p.name}</div>
                                  {p.price != null && (
                                    <div className="text-[10px] text-primary font-semibold mt-0.5">{p.price}₽</div>
                                  )}
                                </button>
                              ))}
                            {(products || []).filter(p => {
                              if (!pickerQuery.trim()) return true;
                              const q = pickerQuery.toLowerCase();
                              return p.name.toLowerCase().includes(q);
                            }).length === 0 && (
                              <div className="text-center text-muted text-[12px] py-3 w-full">Нет товаров</div>
                            )}
                          </div>
                          <div className="mt-1.5 text-[10.5px] text-muted text-center inline-flex items-center gap-1 w-full justify-center">
                            <Check size={11} /> или напишите без темы — тоже ответим
                          </div>
                        </div>
                      )}

                      <input
                        type="text"
                        placeholder="Коротко: что у вас случилось"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-1">Сообщение</label>
                      <textarea
                        placeholder="Опишите вопрос подробнее..."
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={4}
                        className="field resize-none"
                      />
                    </div>
                    {/* Photos need an authenticated upload, so guests don't get
                        the control — they can describe the issue in text. */}
                    <div>
                      {user && (
                        <>
                          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-1">Фото</label>
                          <ImageUploader value={newImages} onChange={setNewImages} userId={user.id} prefix="support" max={4} compact video />
                        </>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleCreateTicket}
                        disabled={loading || !subject.trim() || !text.trim() || (!user && !guestName.trim())}
                        className="btn-primary flex-1"
                      >
                        {loading ? 'Отправка...' : 'Отправить'}
                      </button>
                      {user && (
                        <button
                          onClick={() => setShowNew(false)}
                          className="btn-outline"
                        >
                          Назад
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <button
                      onClick={() => setShowNew(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 mb-3 bg-primary/10 text-primary border border-primary/25 text-sm font-semibold cursor-pointer hover:bg-primary/15 transition"
                    >
                      <Plus size={16} /> Новое обращение
                    </button>
                    {tickets.length === 0 ? (
                      <div className="text-center text-muted py-6 text-sm">
                        <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
                        <p>Нет обращений</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tickets.map(t => {
                          const st = statusLabel[t.status] || statusLabel.open;
                          return (
                            <button
                              key={t.id}
                              onClick={() => openTicket(t)}
                              className="w-full text-left p-3 border border-border hover:border-primary/30 hover:bg-primary/5 transition cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[13px] font-semibold text-text truncate">{unescapeHtml(t.subject)}</span>
                                <span className={`text-[10px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 shrink-0 ${st.color}`}>{st.text}</span>
                              </div>
                              <div className="text-[11px] text-muted">
                                {new Date(t.updated_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Message input (when viewing a ticket) */}
              {activeTicket && activeTicket.status !== 'closed' && (
                <div className="px-4 py-3 border-t border-border bg-card shrink-0">
                  {user && msgImages.length > 0 && (
                    <div className="mb-2">
                      <ImageUploader value={msgImages} onChange={setMsgImages} userId={user.id} prefix="support" max={4} compact video />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                  {user && msgImages.length === 0 && (
                    <ImageUploader value={msgImages} onChange={setMsgImages} userId={user.id} prefix="support" max={4} compact video />
                  )}
                  <input
                    type="text"
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder="Сообщение..."
                    className="field !h-11"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!msgText.trim() && !msgImages.length}
                    className="btn-primary !w-11 !h-11 !p-0 shrink-0"
                  >
                    <Send size={16} />
                  </button>
                  </div>
                </div>
              )}
              {activeTicket && activeTicket.status === 'closed' && (
                <div className="px-4 py-3 border-t border-border bg-surface text-center text-[12px] text-muted font-semibold shrink-0">
                  Обращение закрыто
                </div>
              )}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
