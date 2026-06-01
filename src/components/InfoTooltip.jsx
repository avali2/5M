import React, { useState } from 'react';

export default function InfoTooltip({ explanation, position = 'top' }) {
  const [show, setShow] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div className="relative inline-flex items-center ml-1">
      <button
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-gray-400 hover:text-blue-500 transition w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center text-xs font-bold"
        aria-label="Más información"
      >
        ?
      </button>
      {show && (
        <div className={`absolute z-50 ${positionClasses[position]} w-48 p-2 text-xs bg-gray-900 text-white rounded shadow-lg transition-opacity duration-150`}>
          {explanation}
          <div className="absolute w-2 h-2 bg-gray-900 rotate-45 left-1/2 -translate-x-1/2 -bottom-1"></div>
        </div>
      )}
    </div>
  );
}