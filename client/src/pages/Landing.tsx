import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Search, 
  MessageSquare, 
  Zap, 
  Shield, 
  ArrowRight,
  ChevronRight,
  Globe,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  UploadCloud,
  MousePointer2,
  BarChart4,
  Menu,
  X
} from 'lucide-react';
import './Landing.css';

const Landing: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="landing-container">
      {/* Background Blobs */}
      <div className="abstract-blob blob-1"></div>
      <div className="abstract-blob blob-2"></div>
      <div className="abstract-blob blob-3"></div>

      {/* Header */}
      <header className="landing-header">
        <div className="container header-content">
          <Link to="/" className="logo" style={{textDecoration: 'none'}}>
            <Sparkles className="logo-icon" size={28} />
            <span className="logo-text">ResumeAI</span>
          </Link>
          
          <nav className={`header-nav ${isMenuOpen ? 'active' : ''}`}>
            <a href="#features" onClick={() => setIsMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setIsMenuOpen(false)}>How it Works</a>
            <a href="#about" onClick={() => setIsMenuOpen(false)}>About</a>
            <div className="mobile-only-actions">
              <Link to="/login" className="btn btn-ghost" onClick={() => setIsMenuOpen(false)}>Login</Link>
              <Link to="/signup" className="btn btn-primary" onClick={() => setIsMenuOpen(false)}>Sign Up Free</Link>
            </div>
          </nav>

          <div className="header-actions">
            <Link to="/login" className="btn btn-ghost">Login</Link>
            <Link to="/signup" className="btn btn-primary">Sign Up Free</Link>
          </div>

          <button className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-content">
          <div className="hero-text">
            <div className="badge">
              <Sparkles size={14} style={{marginRight: '8px'}}/>
              New: Advanced GPT-4 Analysis
            </div>
            <h1>Unlock Your Career with <span className="highlight">AI Insights</span></h1>
            <p>Don't just apply. Master your career path with our intelligent resume engine. Get instant feedback, optimization tips, and real-time QA.</p>
            <div className="hero-btns">
              <Link to="/signup" className="btn btn-primary btn-large">
                Get Started Free <ArrowRight size={20} />
              </Link>
              <a href="#features" className="btn btn-ghost btn-large">
                Explore Features <ChevronRight size={20} />
              </a>
            </div>
            <div style={{marginTop: '2rem', display: 'flex', gap: '1.5rem', color: '#64748b', fontSize: '0.9rem'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <CheckCircle2 size={16} color="#10b981"/> 100% Secure
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <CheckCircle2 size={16} color="#10b981"/> No Credit Card Required
              </div>
            </div>
          </div>
          <div className="hero-image">
            <div className="image-wrapper">
              <img 
                src="https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&q=80&w=800" 
                alt="AI Analysis" 
                className="hero-main-img"
              />
              <div className="floating-card c1">
                <div className="c1-icon"><CheckCircle2 size={24} /></div>
                <span>98% Match Score</span>
              </div>
              <div className="floating-card c2">
                <div className="c2-icon"><Zap size={24} /></div>
                <span>AI Optimized</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How it Works</h2>
            <p>Three simple steps to a better career.</p>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <div className="step-icon-wrapper"><UploadCloud size={32}/></div>
              <h3>Upload Resume</h3>
              <p>Simply drag and drop your PDF or paste your text. Our AI handles the rest.</p>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <div className="step-icon-wrapper"><MousePointer2 size={32}/></div>
              <h3>Ask Questions</h3>
              <p>Interact with your resume. Ask about gaps, skills, or interview talking points.</p>
            </div>
            <div className="step-card">
              <div className="step-number">03</div>
              <div className="step-icon-wrapper"><BarChart4 size={32}/></div>
              <h3>Get Insights</h3>
              <p>Receive data-driven feedback to optimize your profile for specific job roles.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <div className="section-header">
            <h2>Experience the Power of AI</h2>
            <p>Our comprehensive toolset is designed to give you an unfair advantage in your job search.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <FileText size={28}/>
              </div>
              <h3>PDF Analysis</h3>
              <p>State-of-the-art OCR technology extracts every nuance from your resume, understanding structure and context.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Search size={28}/>
              </div>
              <h3>Intelligent QA</h3>
              <p>Ask complex questions like "What are my gaps for a Senior Dev role?" and get pinpoint accurate answers.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <MessageSquare size={28}/>
              </div>
              <h3>Persistent Chat</h3>
              <p>Interact with your data through a conversational AI that remembers your history and goals.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Zap size={28}/>
              </div>
              <h3>Vector Search</h3>
              <p>Lightning-fast retrieval using Pinecone vector database for high-precision semantic matching.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Shield size={28}/>
              </div>
              <h3>Enterprise Privacy</h3>
              <p>Your data is yours. We use banking-grade encryption and never sell your information to third parties.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Sparkles size={28}/>
              </div>
              <h3>Smart Summaries</h3>
              <p>Transform lengthy resumes and chats into actionable bullet points for quick review.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Partners Section (Marquee) */}
      <section id="partners" className="partners-section">
        <div className="marquee-container">
          <div className="partners-grid">
            <div className="partner-logo"><Globe size={32} /> <span>Global Tech</span></div>
            <div className="partner-logo"><Cpu size={32} /> <span>Future AI</span></div>
            <div className="partner-logo"><Layers size={32} /> <span>Systemic Inc</span></div>
            <div className="partner-logo"><Sparkles size={32} /> <span>Innovate</span></div>
            <div className="partner-logo"><Globe size={32} /> <span>Tech Giant</span></div>
            <div className="partner-logo"><Cpu size={32} /> <span>AI Labs</span></div>
          </div>
          <div className="partners-grid">
            <div className="partner-logo"><Globe size={32} /> <span>Global Tech</span></div>
            <div className="partner-logo"><Cpu size={32} /> <span>Future AI</span></div>
            <div className="partner-logo"><Layers size={32} /> <span>Systemic Inc</span></div>
            <div className="partner-logo"><Sparkles size={32} /> <span>Innovate</span></div>
            <div className="partner-logo"><Globe size={32} /> <span>Tech Giant</span></div>
            <div className="partner-logo"><Cpu size={32} /> <span>AI Labs</span></div>
          </div>
        </div>
      </section>

      {/* CTA Section (Bento Modern Style) */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-container">
            <div className="cta-content">
              <h2>Ready to build your <span style={{color: 'var(--primary)'}}>future?</span></h2>
              <p>Join over 10,000+ professionals who have optimized their careers with ResumeAI.</p>
              
              <div style={{display: 'flex', gap: '1.5rem', marginBottom: '3rem'}}>
                <Link to="/signup" className="btn btn-primary btn-large">
                  Create Free Account
                </Link>
                <Link to="/login" className="btn btn-ghost btn-large" style={{color: 'white', border: '1px solid rgba(255,255,255,0.2)'}}>
                  Sign In
                </Link>
              </div>

              <div className="cta-stats">
                <div className="stat-item">
                  <span className="stat-value">10k+</span>
                  <span className="stat-label">Active Users</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">95%</span>
                  <span className="stat-label">Success Rate</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">24/7</span>
                  <span className="stat-label">AI Support</span>
                </div>
              </div>
            </div>
            
            <div className="cta-visual">
              <div className="cta-mockup">
                <div className="mockup-line full accent"></div>
                <div className="mockup-line medium"></div>
                <div className="mockup-line short"></div>
                <div className="mockup-line full"></div>
                <div className="mockup-line medium accent"></div>
                <div className="mockup-line short"></div>
                <div className="mockup-line full"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-info">
              <div className="logo" style={{animation: 'none'}}>
                <Sparkles className="logo-icon" size={24} />
                <span className="logo-text">ResumeAI</span>
              </div>
              <p>Empowering the next generation of professionals with cutting-edge artificial intelligence.</p>
            </div>
            <div className="footer-links">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it Works</a>
              <Link to="/login">Login</Link>
            </div>
            <div className="footer-links">
              <h4>Company</h4>
              <a href="#about">About Us</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-links">
              <h4>Legal</h4>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 ResumeAI. Built with ❤️ for the future of work.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
