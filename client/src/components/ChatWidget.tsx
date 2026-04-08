import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, Trash2, RefreshCcw } from 'lucide-react';
import { sendChatMessage, getChatHistory, summarizeChat } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import './ChatWidget.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { showNotification } = useNotification();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadHistory = async () => {
    try {
      const data = await getChatHistory();
      const formattedHistory = data.history.map((h: any) => ({
        ...h,
        timestamp: new Date(h.timestamp)
      }));
      
      // Prepend summary if it exists as an intro message
      const initialMessages = [];
      if (data.summary) {
        initialMessages.push({
          role: 'assistant' as const,
          content: `(Previous session summary: ${data.summary})`,
          timestamp: new Date()
        });
      }
      
      setMessages([...initialMessages, ...formattedHistory]);
    } catch (err) {
      console.error('Failed to load chat history', err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const data = await sendChatMessage(userMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, timestamp: new Date() }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      showNotification(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!window.confirm('This will summarize your current chat and start a fresh session. Continue?')) return;
    
    setIsSummarizing(true);
    try {
      await summarizeChat();
      showNotification('Conversation summarized and cleared!', 'success');
      loadHistory();
    } catch (err) {
      showNotification('Summarization failed', 'error');
    } finally {
      setIsSummarizing(false);
    }
  };

  if (!user) return null;

  return (
    <div className="chat-widget-container">
      {isOpen ? (
        <div className="chat-window">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <Bot size={22} />
              <span>ResumeAI Assistant</span>
            </div>
            <div className="chat-header-actions">
              <button 
                className="chat-header-btn"
                onClick={handleSummarize} 
                title="Summarize and clear session"
                disabled={isSummarizing}
              >
                {isSummarizing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
              </button>
              <button className="chat-header-btn" onClick={() => setIsOpen(false)} title="Close chat">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty-state">
                <div style={{ marginBottom: '12px' }}>👋</div>
                How can I help you today? You can ask about your uploaded resumes or general advice.
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`message-wrapper ${msg.role}`}>
                <div className="message-bubble">
                  {msg.content}
                </div>
                <div className="message-meta">
                  {msg.role === 'assistant' ? 'AI' : 'You'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="typing-indicator">
                <Loader2 className="animate-spin" size={16} />
                <span>AI is thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form className="chat-input-form" onSubmit={handleSend}>
            <input
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
            />
            <button 
              type="submit" 
              className="send-button"
              disabled={!input.trim() || isLoading}
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      ) : (
        <button
          className="chat-button"
          onClick={() => setIsOpen(true)}
        >
          <MessageCircle size={22} />
          <span>How can I help?</span>
        </button>
      )}
    </div>
  );
};

export default ChatWidget;
