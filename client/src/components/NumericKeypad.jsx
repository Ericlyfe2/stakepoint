export default function NumericKeypad({ onInput, onClear, onDone, onDelete }) {
  return (
    <div className="sporty-keypad">
      <div className="sporty-keypad-keys">
        {/* Row 1 */}
        <button type="button" className="num-key" onClick={() => onInput('1')}>1</button>
        <button type="button" className="num-key" onClick={() => onInput('2')}>2</button>
        <button type="button" className="num-key" onClick={() => onInput('3')}>3</button>
        <button type="button" className="num-key" onClick={() => onInput('4')}>4</button>
        <button type="button" className="num-key" onClick={() => onInput('5')}>5</button>
        <button type="button" className="num-key" onClick={() => onInput('6')}>6</button>
        <button type="button" className="num-key num-key--delete" onClick={onDelete} aria-label="Delete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>

        {/* Row 2 */}
        <button type="button" className="num-key" onClick={() => onInput('7')}>7</button>
        <button type="button" className="num-key" onClick={() => onInput('8')}>8</button>
        <button type="button" className="num-key" onClick={() => onInput('9')}>9</button>
        <button type="button" className="num-key" onClick={() => onInput('0')}>0</button>
        <button type="button" className="num-key" onClick={() => onInput('.')}>.</button>
        <button type="button" className="num-key" onClick={() => onInput('00')}>00</button>
        <button type="button" className="num-key num-key--clear" onClick={onClear}>Clear</button>
      </div>
      <button type="button" className="num-key num-key--done" onClick={onDone}>Done</button>
    </div>
  );
}
