'use client';

import { PageBackground } from '@/components/PageBackground';
import type { Dispatch, SetStateAction } from 'react';
import { CabinetHistoryHeader } from './CabinetHistoryHeader';
import { CabinetHistoryTabs } from './CabinetHistoryTabs';
import { BattleHistorySection } from './BattleHistorySection';
import { ChatHistorySection } from './ChatHistorySection';
import { EconomyHistorySection } from './EconomyHistorySection';
import { RadianceHistorySection } from './RadianceHistorySection';
import type {
  BattleHistoryEntry,
  CabinetHistoryTab,
  ChatHistoryEntry,
  EconomyHistoryItem,
  RadianceHistoryItem,
} from './types';

type CabinetHistoryContentProps = {
  activeTab: CabinetHistoryTab;
  setActiveTab: Dispatch<SetStateAction<CabinetHistoryTab>>;
  battleHistory: BattleHistoryEntry[];
  loadingBattles: boolean;
  chats: ChatHistoryEntry[];
  loadingChats: boolean;
  chatError: string;
  chatHasMore: boolean;
  loadingMoreChats: boolean;
  currentUserId?: string;
  radianceHistory: RadianceHistoryItem[];
  radianceTotal: number;
  loadingRadiance: boolean;
  radianceHasMore: boolean;
  kHistory: EconomyHistoryItem[];
  kTotal: number;
  loadingK: boolean;
  kHasMore: boolean;
  starsHistory: EconomyHistoryItem[];
  starsTotal: number;
  loadingStars: boolean;
  starsHasMore: boolean;
  language: string;
  t: (key: string) => string;
  getEconomyEntryName: (row: EconomyHistoryItem, mode: 'k' | 'stars') => string;
  getRadianceActivityName: (activityType: string, amount: number) => string;
  getTreeHealConversionText: (row: RadianceHistoryItem) => string | null;
  onViewBattleSummary: (battleId: string) => void;
  onViewChat: (chat: ChatHistoryEntry) => void;
  onAddFriend: (partnerId: string, partnerName: string) => void;
  onDispute: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onLoadMoreChats: () => void;
  onLoadMoreRadiance: () => void;
  onLoadMoreK: () => void;
  onLoadMoreStars: () => void;
};

export function CabinetHistoryContent({
  activeTab,
  setActiveTab,
  battleHistory,
  loadingBattles,
  chats,
  loadingChats,
  chatError,
  chatHasMore,
  loadingMoreChats,
  currentUserId,
  radianceHistory,
  radianceTotal,
  loadingRadiance,
  radianceHasMore,
  kHistory,
  kTotal,
  loadingK,
  kHasMore,
  starsHistory,
  starsTotal,
  loadingStars,
  starsHasMore,
  language,
  t,
  getEconomyEntryName,
  getRadianceActivityName,
  getTreeHealConversionText,
  onViewBattleSummary,
  onViewChat,
  onAddFriend,
  onDispute,
  onDeleteChat,
  onLoadMoreChats,
  onLoadMoreRadiance,
  onLoadMoreK,
  onLoadMoreStars,
}: CabinetHistoryContentProps) {
  return (
    <>
      <PageBackground />

      <div className="custom-scrollbar relative z-10 h-full overflow-y-auto px-6 py-8 lg:no-scrollbar">
        <div className="space-y-6 pb-12">
          <CabinetHistoryHeader t={t} />

          <CabinetHistoryTabs
            activeTab={activeTab}
            counts={{
              battles: battleHistory.length,
              chats: chats.length,
              radiance: radianceHistory.length,
              k: kHistory.length,
              stars: starsHistory.length,
            }}
            t={t}
            setActiveTab={setActiveTab}
          />

          {activeTab === 'battles' && (
            <BattleHistorySection
              battleHistory={battleHistory}
              loadingBattles={loadingBattles}
              language={language}
              t={t}
              onViewBattleSummary={onViewBattleSummary}
            />
          )}

          {activeTab === 'chats' && (
            <ChatHistorySection
              chats={chats}
              loadingChats={loadingChats}
              chatError={chatError}
              chatHasMore={chatHasMore}
              loadingMoreChats={loadingMoreChats}
              currentUserId={currentUserId}
              language={language}
              t={t}
              onViewChat={onViewChat}
              onAddFriend={onAddFriend}
              onDispute={onDispute}
              onDeleteChat={onDeleteChat}
              onLoadMore={onLoadMoreChats}
            />
          )}

          {activeTab === 'radiance' && (
            <RadianceHistorySection
              radianceHistory={radianceHistory}
              radianceTotal={radianceTotal}
              loadingRadiance={loadingRadiance}
              radianceHasMore={radianceHasMore}
              language={language}
              t={t}
              getRadianceActivityName={getRadianceActivityName}
              getTreeHealConversionText={getTreeHealConversionText}
              onLoadMore={onLoadMoreRadiance}
            />
          )}

          {activeTab === 'k' && (
            <EconomyHistorySection
              mode="k"
              items={kHistory}
              total={kTotal}
              loading={loadingK}
              hasMore={kHasMore}
              language={language}
              t={t}
              getEconomyEntryName={getEconomyEntryName}
              onLoadMore={onLoadMoreK}
            />
          )}

          {activeTab === 'stars' && (
            <EconomyHistorySection
              mode="stars"
              items={starsHistory}
              total={starsTotal}
              loading={loadingStars}
              hasMore={starsHasMore}
              language={language}
              t={t}
              getEconomyEntryName={getEconomyEntryName}
              onLoadMore={onLoadMoreStars}
            />
          )}
        </div>
      </div>
    </>
  );
}
