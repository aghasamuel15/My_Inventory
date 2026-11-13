'use client';

import { useState } from 'react';

export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required = true,
  minLength,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-12"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-[#738078] transition hover:text-[#20372c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#176b52]"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
            <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.4 3.3M6.2 6.2C3.9 7.7 2.8 9.9 2.5 12c.5 1.2 2.2 4.2 6.1 5.5a10.7 10.7 0 0 0 5.5.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
