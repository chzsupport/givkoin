'use client';

import { EvilRootFlyingTextLayer } from '@/components/evil-root/EvilRootFlyingTextLayer';
import { EvilRootInputPanel } from '@/components/evil-root/EvilRootInputPanel';
import { EvilRootSupportPhrase } from '@/components/evil-root/EvilRootSupportPhrase';
import { useEvilRootSession } from '@/components/evil-root/useEvilRootSession';

export default function BlackHolePage() {
  const {
    flyingTexts,
    handleFinish,
    handleSubmit,
    inputRef,
    isSending,
    removeFlyingText,
    setText,
    supportPhrase,
    t,
    text,
  } = useEvilRootSession();

  return (
    <div
      className="fixed inset-0 z-50 bg-black overflow-hidden"
      style={{
        overflow: 'hidden',
        overscrollBehavior: 'none',
      }}
    >
      <video
        src="/black-hole.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover -z-20"
      />

      <EvilRootSupportPhrase phrase={supportPhrase} />
      <EvilRootFlyingTextLayer
        flyingTexts={flyingTexts}
        onRemoveText={removeFlyingText}
      />
      <EvilRootInputPanel
        inputRef={inputRef}
        isSending={isSending}
        onFinish={handleFinish}
        onSubmit={handleSubmit}
        onTextChange={setText}
        t={t}
        text={text}
      />
    </div>
  );
}
