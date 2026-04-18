import React, { useState } from "react";

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

const staticMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hello. I'm the Health Guardian clinical assistant. I'm here to help you evaluate your symptoms and determine the best next steps for your care.\n\nTo begin, could you briefly describe the main reason you are seeking guidance today?",
  },
  {
    role: "user",
    content:
      "I've been having a sharp pain in my lower right abdomen since last night. It's making it hard to walk or stand up straight.",
  },
  {
    role: "assistant",
    content:
      "Thank you for sharing that. Lower right abdominal pain can be significant. Let's gather a bit more information to ensure your safety.\n\nAre you currently experiencing any of the following accompanying symptoms: fever, nausea, or vomiting?",
  },
  {
    role: "user",
    content: "Yes, I feel slightly nauseous, but no fever that I know of.",
  },
];

const SymptomCheckPage: React.FC = () => {
  const [painRating, setPainRating] = useState(7);

  return (
    <div className="flex flex-col h-full relative">
      {/* Scrollable Chat Area */}
      <div className="flex-1 overflow-y-auto w-full px-4 sm:px-8 py-8 flex flex-col items-center">
        <div className="w-full max-w-3xl flex flex-col gap-6 pb-32">
          {/* Timestamp */}
          <div className="flex flex-col items-center mb-6 opacity-70">
            <span className="text-xs font-medium text-on-surface-variant bg-surface-container-high px-3 py-1 rounded-full uppercase tracking-wider">
              Today, 10:42 AM
            </span>
          </div>

          {/* Chat Messages */}
          {staticMessages.map((msg, idx) =>
            msg.role === "assistant" ? (
              <div key={idx} className="flex gap-4 w-full">
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 border border-outline-variant/30">
                  <span
                    className="material-symbols-outlined text-primary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    smart_toy
                  </span>
                </div>
                <div className="bg-surface-container-lowest border border-outline-variant/20 shadow-[0_4px_16px_rgba(24,28,32,0.02)] text-on-surface rounded-2xl rounded-tl-none p-5 w-fit max-w-[85%] font-body text-sm leading-relaxed">
                  {msg.content.split("\n\n").map((para, pIdx) => (
                    <p key={pIdx} className={pIdx > 0 ? "mt-3" : ""}>
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div key={idx} className="flex gap-4 w-full justify-end">
                <div className="bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-2xl rounded-tr-none p-5 w-fit max-w-[85%] font-body text-sm leading-relaxed shadow-[0_8px_24px_rgba(0,55,111,0.15)]">
                  <p>{msg.content}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 border-2 border-surface">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">
                    person
                  </span>
                </div>
              </div>
            ),
          )}

          {/* Interactive Pain Scale */}
          <div className="flex gap-4 w-full relative">
            <div className="absolute -left-2 top-0 bottom-0 w-[2px] bg-secondary/30 rounded-full"></div>
            <div className="w-10 h-10 rounded-full bg-surface-container-lowest flex items-center justify-center shrink-0 border border-secondary shadow-[0_0_12px_rgba(0,105,109,0.2)]">
              <span
                className="material-symbols-outlined text-secondary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                smart_toy
              </span>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/20 shadow-[0_12px_32px_rgba(24,28,32,0.06)] text-on-surface rounded-2xl rounded-tl-none p-6 w-full max-w-[85%] flex flex-col gap-5 z-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              <div>
                <p className="font-body text-sm leading-relaxed text-on-surface mb-2">
                  Understood. To help gauge the urgency, how would you rate the
                  severity of the pain on a scale from 1 to 10 right now?
                </p>
                <p className="text-xs text-on-surface-variant italic">
                  (1 being barely noticeable, 10 being the worst pain
                  imaginable)
                </p>
              </div>
              <div className="bg-surface px-6 py-8 rounded-xl border border-outline-variant/10">
                <div className="relative w-full">
                  <div className="flex justify-between text-xs font-semibold text-primary mb-4 px-1">
                    {Array.from({ length: 10 }, (_, i) => (
                      <span key={i}>{i + 1}</span>
                    ))}
                  </div>
                  <input
                    className="w-full"
                    max={10}
                    min={1}
                    type="range"
                    value={painRating}
                    onChange={(e) => setPainRating(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-on-surface-variant mt-3 px-1 font-medium">
                    <span>Mild</span>
                    <span>Moderate</span>
                    <span className="text-error font-bold">Severe</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button className="gradient-primary text-on-primary px-6 py-2.5 rounded-lg font-label font-semibold hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center gap-2">
                  Submit Rating
                  <span className="material-symbols-outlined text-sm">
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Input Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-surface-container-lowest border-t border-outline-variant/20 p-4 md:p-6 shadow-[0_-8px_32px_rgba(24,28,32,0.04)] z-20">
        <div className="max-w-3xl mx-auto w-full relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-outline">
              edit_note
            </span>
          </div>
          <input
            className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl py-4 pl-12 pr-16 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder-on-surface-variant/50 shadow-inner"
            placeholder="Type your response here..."
            type="text"
          />
          <button className="absolute inset-y-2 right-2 bg-secondary text-on-secondary w-10 h-10 rounded-lg flex items-center justify-center hover:bg-secondary-fixed-dim transition-colors shadow-[0_2px_8px_rgba(0,105,109,0.2)]">
            <span
              className="material-symbols-outlined text-sm"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              send
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SymptomCheckPage;
