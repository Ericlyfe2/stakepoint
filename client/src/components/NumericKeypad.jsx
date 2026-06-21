export default function NumericKeypad({ onInput, onClear, onDone }) {
  const keys = [
    ['1', '2', '3', '4', '5'],
    ['6', '7', '8', '9', '0'],
    ['.', '00', 'Clear'],
  ];

  return (
    <div className="num-keypad">
      {keys.map((row, ri) => (
        <div key={ri} className="num-keypad-row">
          {row.map((k) => {
            if (k === 'Clear') {
              return (
                <button key={k} type="button" className="num-key num-key--clear" onClick={onClear}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                    <line x1="18" y1="9" x2="12" y2="15" />
                    <line x1="12" y1="9" x2="18" y2="15" />
                  </svg>
                </button>
              );
            }
            return (
              <button key={k} type="button" className="num-key" onClick={() => onInput(k)}>
                {k}
              </button>
            );
          })}
        </div>
      ))}
      <div className="num-keypad-row">
        <button type="button" className="num-key num-key--done" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
