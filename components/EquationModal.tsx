import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface EquationModalProps {
  initialLatex?: string;
  onSave: (latex: string) => void;
  onClose: () => void;
}

const SYMBOL_CATEGORIES = {
  'Basic': [
    { latex: '+', label: '+' },
    { latex: '-', label: '-' },
    { latex: '\\times', label: '×' },
    { latex: '\\div', label: '÷' },
    { latex: '=', label: '=' },
    { latex: '\\neq', label: '≠' },
    { latex: '\\pm', label: '±' },
    { latex: '\\frac{a}{b}', label: 'Fraction' },
    { latex: '\\sqrt{x}', label: 'Sqrt' },
    { latex: 'x^2', label: 'Power' },
    { latex: 'x_2', label: 'Subscript' },
    { latex: '\\log', label: 'log' },
    { latex: '\\ln', label: 'ln' },
    { latex: '\\sin', label: 'sin' },
    { latex: '\\cos', label: 'cos' },
    { latex: '\\tan', label: 'tan' },
  ],
  'Greek': [
    { latex: '\\alpha', label: 'α' },
    { latex: '\\beta', label: 'β' },
    { latex: '\\gamma', label: 'γ' },
    { latex: '\\delta', label: 'δ' },
    { latex: '\\epsilon', label: 'ε' },
    { latex: '\\theta', label: 'θ' },
    { latex: '\\lambda', label: 'λ' },
    { latex: '\\mu', label: 'μ' },
    { latex: '\\pi', label: 'π' },
    { latex: '\\sigma', label: 'σ' },
    { latex: '\\phi', label: 'φ' },
    { latex: '\\omega', label: 'ω' },
    { latex: '\\Delta', label: 'Δ' },
    { latex: '\\Omega', label: 'Ω' },
    { latex: '\\Sigma', label: 'Σ' },
  ],
  'Operators': [
    { latex: '\\sum', label: '∑' },
    { latex: '\\prod', label: '∏' },
    { latex: '\\int', label: '∫' },
    { latex: '\\oint', label: '∮' },
    { latex: '\\lim_{x \\to 0}', label: 'lim' },
    { latex: '\\frac{\\partial}{\\partial x}', label: '∂/∂x' },
    { latex: '\\infty', label: '∞' },
    { latex: '\\nabla', label: '∇' },
  ],
  'Relations': [
    { latex: '<', label: '<' },
    { latex: '>', label: '>' },
    { latex: '\\leq', label: '≤' },
    { latex: '\\geq', label: '≥' },
    { latex: '\\approx', label: '≈' },
    { latex: '\\equiv', label: '≡' },
    { latex: '\\in', label: '∈' },
    { latex: '\\notin', label: '∉' },
    { latex: '\\subset', label: '⊂' },
    { latex: '\\subseteq', label: '⊆' },
  ],
  'Arrows': [
    { latex: '\\rightarrow', label: '→' },
    { latex: '\\leftarrow', label: '←' },
    { latex: '\\leftrightarrow', label: '↔' },
    { latex: '\\Rightarrow', label: '⇒' },
    { latex: '\\Leftarrow', label: '⇐' },
    { latex: '\\Leftrightarrow', label: '⇔' },
  ],
  'Matrix': [
    { latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', label: '(Matrix)' },
    { latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', label: '[Matrix]' },
    { latex: '\\begin{cases} x & \\text{if } x > 0 \\\\ -x & \\text{if } x < 0 \\end{cases}', label: 'Cases' },
  ]
};

const EquationModal: React.FC<EquationModalProps> = ({ initialLatex = '', onSave, onClose }) => {
  const [latex, setLatex] = useState(initialLatex);
  const [activeTab, setActiveTab] = useState<keyof typeof SYMBOL_CATEGORIES>('Basic');
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previewRef.current) {
      try {
        katex.render(latex || '\\text{Preview}', previewRef.current, {
          throwOnError: false,
          displayMode: true,
        });
      } catch (e) {
        // Ignore render errors while typing
      }
    }
  }, [latex]);

  const insertSymbol = (symbol: string) => {
    setLatex((prev) => prev + ' ' + symbol);
  };

  const handleSave = () => {
    onSave(latex);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h3 className="font-bold text-lg text-gray-800">Equation Editor (LaTeX)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Preview Area */}
          <div className="bg-gray-100 p-6 rounded-lg flex items-center justify-center min-h-[100px] border border-gray-200">
            <div ref={previewRef} className="text-xl"></div>
          </div>

          {/* Input Area */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">LaTeX Input</label>
            <textarea
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              className="w-full p-3 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              rows={3}
              placeholder="Type LaTeX here (e.g., \frac{a}{b})"
            />
          </div>

          {/* Symbol Palette */}
          <div>
            <div className="flex border-b mb-2 overflow-x-auto">
              {Object.keys(SYMBOL_CATEGORIES).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat as any)}
                  className={`px-3 py-2 text-xs font-bold uppercase whitespace-nowrap ${
                    activeTab === cat
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1">
              {SYMBOL_CATEGORIES[activeTab].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => insertSymbol(item.latex)}
                  className="p-2 border rounded hover:bg-blue-50 hover:border-blue-300 flex flex-col items-center justify-center transition text-center"
                  title={item.latex}
                >
                  <span className="text-xs text-gray-400 mb-1">{item.label}</span>
                  <span dangerouslySetInnerHTML={{ __html: katex.renderToString(item.latex, { throwOnError: false }) }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium">
            Cancel
          </button>
          <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md">
            Insert Equation
          </button>
        </div>
      </div>
    </div>
  );
};

export default EquationModal;
