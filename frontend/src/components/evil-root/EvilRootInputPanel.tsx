import type { RefObject } from 'react';
import { MAX_EVIL_ROOT_SYMBOLS } from './constants';

export function EvilRootInputPanel({
  inputRef,
  isSending,
  onFinish,
  onSubmit,
  onTextChange,
  t,
  text,
}: {
  inputRef: RefObject<HTMLTextAreaElement>;
  isSending: boolean;
  onFinish: () => void;
  onSubmit: () => void;
  onTextChange: (value: string) => void;
  t: (key: string) => string;
  text: string;
}) {
  return (
    <div className="absolute left-0 right-0 bottom-10 flex items-center justify-center z-40 overflow-x-hidden">
      <div className="flex flex-col items-center justify-center w-full text-body text-neutral-200 px-4">
        <textarea
          ref={inputRef}
          value={text}
          rows={5}
          onChange={(event) => {
            let value = event.target.value;
            if (value.length > MAX_EVIL_ROOT_SYMBOLS) {
              value = value.slice(0, MAX_EVIL_ROOT_SYMBOLS);
            }

            onTextChange(value);

            const element = event.target;
            element.style.height = 'auto';
            element.style.height = `${element.scrollHeight}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!isSending && text.trim()) {
                onSubmit();
                if (inputRef.current) {
                  inputRef.current.style.height = 'auto';
                }
              }
            }
          }}
          placeholder=""
          className="w-full max-w-5xl bg-transparent text-center text-neutral-100 placeholder:text-neutral-500/40 focus:outline-none focus:ring-0 focus:border-none border-none mx-auto resize-none italic leading-relaxed text-body"
          style={{
            caretColor: '#9CA3AF',
            overflow: 'hidden',
            maxHeight: '22vh',
          }}
        />
        <div className="mt-2 text-caption text-neutral-400/70">
          {text.length} / {MAX_EVIL_ROOT_SYMBOLS}
        </div>
        <div className="mt-3 flex flex-col items-center gap-2 mb-2">
          <span
            onClick={() => {
              if (!isSending && text.trim()) {
                onSubmit();
              }
            }}
            className={`pointer-events-auto select-none transition-opacity text-secondary ${isSending || !text.trim()
              ? 'opacity-30 cursor-default'
              : 'opacity-80 hover:opacity-100 cursor-pointer'
              }`}
          >
            {t('common.send')}
          </span>
          <span
            onClick={onFinish}
            className="pointer-events-auto select-none opacity-70 hover:opacity-100 transition-opacity cursor-pointer text-secondary"
          >
            {t('evil_root.finish_session')}
          </span>
        </div>
      </div>
    </div>
  );
}
