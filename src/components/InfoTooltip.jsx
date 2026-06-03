import React, { useId, useState } from 'react';

export default function InfoTooltip({ explanation, position = 'top' }) {
  const [show, setShow] = useState(false);
  const id = useId();

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <span className="relative inline-flex items-center ml-1 align-middle">
      <button
        type="button"
        onClick={() => setShow((current) => !current)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="help-tooltip-trigger flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-black text-slate-600 transition hover:border-blue-400 hover:text-blue-700"
        aria-label="Mas informacion"
        aria-describedby={show ? id : undefined}
      >
        ?
      </button>
      {show && (
        <span id={id} role="tooltip" className={`info-tip help-tooltip absolute ${positionClasses[position] || positionClasses.top}`}>
          {explanation || 'Sin descripcion disponible.'}
          <span className="info-tip-arrow absolute h-2 w-2 rotate-45 left-1/2 -translate-x-1/2 -bottom-1" />
        </span>
      )}
    </span>
  );
}
