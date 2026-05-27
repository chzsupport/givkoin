'use client';

import { PageBackground } from '@/components/PageBackground';
import { EntityAvatarGalleryStep } from '@/components/entity-create/EntityAvatarGalleryStep';
import { EntityConfirmStep } from '@/components/entity-create/EntityConfirmStep';
import { EntityNameStep } from '@/components/entity-create/EntityNameStep';
import { EntityPreviewModal } from '@/components/entity-create/EntityPreviewModal';
import { useEntityCreateFlow } from '@/components/entity-create/useEntityCreateFlow';

export default function CreateEntityPage() {
  const {
    agreed,
    avatars,
    avatarsLoading,
    canChange,
    changeMode,
    daysLeft,
    error,
    focusedAvatar,
    handleAvatarChoose,
    handleSaveName,
    isSubmitting,
    name,
    previewAvatar,
    selectedAvatar,
    setAgreed,
    setFocusedAvatar,
    setName,
    setPreviewAvatar,
    setStep,
    step,
    t,
  } = useEntityCreateFlow();

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-neutral-950 text-white">
      <PageBackground />

      <div className="relative z-10 container mx-auto px-4 py-20 flex flex-col items-center">
        <div className="max-w-4xl w-full bg-neutral-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl min-h-[600px] flex flex-col">
          {step === 'gallery' && (
            <EntityAvatarGalleryStep
              avatars={avatars}
              avatarsLoading={avatarsLoading}
              canChange={canChange}
              changeMode={changeMode}
              daysLeft={daysLeft}
              focusedAvatar={focusedAvatar}
              selectedAvatar={selectedAvatar}
              t={t}
              onAvatarChoose={handleAvatarChoose}
              onAvatarFocus={setFocusedAvatar}
              onConfirm={() => setStep('confirm')}
              onPreview={setPreviewAvatar}
            />
          )}

          {step === 'confirm' && selectedAvatar && (
            <EntityConfirmStep
              agreed={agreed}
              changeMode={changeMode}
              selectedAvatar={selectedAvatar}
              t={t}
              onAgreeChange={setAgreed}
              onBack={() => setStep('gallery')}
              onFinalCreate={() => setStep('name')}
            />
          )}

          {step === 'name' && selectedAvatar && (
            <EntityNameStep
              changeMode={changeMode}
              error={error}
              isSubmitting={isSubmitting}
              name={name}
              selectedAvatar={selectedAvatar}
              t={t}
              onNameChange={setName}
              onSaveName={handleSaveName}
            />
          )}
        </div>
      </div>

      {previewAvatar && (
        <EntityPreviewModal
          previewAvatar={previewAvatar}
          t={t}
          onChoose={(avatar) => {
            handleAvatarChoose(avatar);
            setPreviewAvatar(null);
          }}
          onClose={() => setPreviewAvatar(null)}
        />
      )}
    </main>
  );
}
